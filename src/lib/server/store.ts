import 'server-only';
import { after } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { VIEW_EVENT, gameChannel } from '@/lib/channel';
import { CODE_LENGTH } from '@/lib/code';
import {
  applyAction,
  createGame,
  toSharedView,
  toView,
  type Action,
  type GameState,
  type GameView,
} from '@/lib/skyjo';

/**
 * Accès à l'état des parties, côté serveur uniquement.
 *
 * L'état complet est secret : il ne sort d'ici que sous forme de `GameView`, la
 * projection expurgée destinée à un joueur précis. Deux implémentations :
 *   - Supabase, dès que les variables d'environnement sont là ;
 *   - une carte en mémoire sinon, pour pouvoir lancer `npm run dev` sans rien
 *     configurer. Ce repli est refusé en production, où l'absence de
 *     configuration doit être une erreur bruyante et non une partie fantôme.
 */

/** Mille codes possibles, et les parties dorment moins de quinze jours :
 *  la boucle de `createRoom` absorbe les rares collisions. */
const CODE_ALPHABET = '0123456789';

/**
 * Combien de fois un coup peut être rejoué sur un état plus frais.
 *
 * Ce compteur ne borne pas le temps — c'est `ACTION_BUDGET_MS` qui s'en charge,
 * et c'est la seule borne qui compte pour ne pas être coupé en plein vol. Ce
 * compteur-là borne la **contention** : combien de mains peuvent écrire en même
 * temps sur la même partie avant qu'on renonce.
 *
 * Il valait six, et six suffit à deux joueurs — un tour de Skyjo est séquentiel,
 * à tout instant un seul joueur a le droit d'écrire. Sauf à un endroit, et il
 * revient à chaque manche : le **retournement initial**, le seul moment du jeu
 * où tout le monde joue en même temps. Quatre joueurs qui retournent deux
 * cartes, ce sont huit écritures concurrentes ; celui qui perd toutes les
 * courses a besoin de huit tentatives, pas de six, et repartait avec un bandeau
 * rouge sur un coup parfaitement légal. Mesuré contre un dos à la latence d'une
 * vraie base : deux requêtes perdues sur huit à quatre joueurs, dix sur seize à
 * huit (cf. `store.contention.test.ts`).
 *
 * Vingt-quatre couvre le pire cas de la table complète (huit joueurs, seize
 * écritures) avec de la marge, et ne coûte rien quand il n'y a pas de
 * contention : un refus de verrou, c'est un aller-retour, pas une seconde. Le
 * budget de temps reste la vraie sortie de secours.
 */
const MAX_COMMIT_RETRIES = 24;

/**
 * Combien de temps on laisse à un appel Supabase avant de le considérer perdu.
 *
 * La passerelle du projet, elle, attend cinq secondes avant de rendre un
 * « Gateway Timeout ». Attendre autant, c'est offrir au joueur cinq secondes
 * d'écran figé puis une erreur ; couper avant, c'est pouvoir retenter pendant
 * qu'il regarde encore sa carte bouger. Le 99ᵉ centile d'un appel qui aboutit
 * est à 1,4 s : deux secondes et demie laissent passer tout ce qui va arriver.
 */
const RPC_TIMEOUT_MS = 2500;

/**
 * Budget total d'une action, tentatives comprises. Au-delà, on rend la main.
 *
 * Six tentatives à deux secondes et demie dépasseraient la durée de vie d'une
 * fonction serverless : être coupé en plein coup ne dit rien au joueur, alors
 * qu'un « réessaie » rendu à temps lui laisse la main.
 */
const ACTION_BUDGET_MS = 7000;

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Le transport a lâché : l'appel n'a pas répondu.
 *
 * À distinguer d'une erreur de base, parce que la conséquence n'est pas la
 * même : une requête sans réponse n'est pas une requête qui n'a pas eu lieu.
 * Une lecture se refait sans y penser ; une écriture, elle, a pu passer, et
 * c'est tout l'objet de `writeId` plus bas.
 *
 * Côté joueur c'est un 503 : « réessaie », pas « c'est cassé ».
 */
class TransientError extends GameError {
  constructor(readonly detail: string) {
    super('Le serveur met du temps à répondre. Réessaie.', 503);
    console.warn('[skyjo] appel perdu :', detail);
  }
}

/**
 * Une panne de transport, ou une vraie réponse de la base ?
 *
 * `status` vient de PostgREST : 0 quand la requête n'est jamais partie (réseau
 * coupé, appel abandonné), 5xx quand c'est la passerelle qui a renoncé. Tout
 * cela se retente. Le reste — 400, 404, une contrainte violée — est une
 * réponse : la retenter donnerait deux fois la même.
 */
function isTransient(status: number, message: string): boolean {
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  return /abort|timeout|timed out|fetch failed|network|socket|econn/i.test(message);
}

/**
 * La marque d'une écriture, posée dans l'état lui-même.
 *
 * Quand une écriture ne répond pas, on ne sait pas si elle a eu lieu. Relire ne
 * suffit pas à trancher : trouver la version attendue en base ne dit pas qui
 * l'a écrite — l'adversaire a pu jouer le même numéro pendant ce temps. Rejouer
 * son coup sur un doute, c'est risquer de le jouer deux fois.
 *
 * D'où ce jeton, tiré au sort avant chaque écriture et transporté par l'état :
 * s'il est là, c'est que l'écriture est passée. `applyAction` clone l'état, donc
 * il survit aux coups suivants — un adversaire qui joue par-dessus ne l'efface
 * pas, et c'est très bien : l'écriture avait bien eu lieu.
 */
type Stamped = GameState & { writeId?: string };

function stampOf(state: GameState | null): string | undefined {
  return (state as Stamped | null)?.writeId;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Tolérant à la saisie : on colle un code espacé (« 482 907 »), tiret compris,
 * il arrive ici propre. La mise en majuscules ne sert plus qu'aux parties
 * créées avant le passage au tout-numérique, dont les codes vivent encore.
 */
export function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// ---------------------------------------------------------------------------
// Deux dos possibles
// ---------------------------------------------------------------------------

/**
 * Le résultat d'une écriture sous verrou optimiste. Trois issues, pas deux.
 *
 * `stale` : la version a bougé, quelqu'un a joué avant. L'état frais accompagne
 * le refus — sans lui, rejouer son coup coûtait une relecture complète, un
 * aller-retour de plus sur le chemin le plus chaud du jeu.
 *
 * `silent` : l'appel n'a pas répondu. Ce n'est pas un échec, c'est une absence
 * de nouvelle — l'écriture a très bien pu avoir lieu. La confondre avec un
 * échec, c'est rejouer le coup ; la confondre avec un succès, c'est le perdre.
 * Seule la base peut trancher, et `writeId` est ce qui le lui permet.
 */
export type CommitResult =
  | { outcome: 'written' }
  | { outcome: 'stale'; state: GameState | null }
  | { outcome: 'silent' };

export interface Backend {
  create(code: string, state: GameState): Promise<{ id: string } | 'code-taken'>;
  load(code: string): Promise<GameState | null>;
  /** Écrit seulement si la version en base est encore `expectedVersion`. */
  commit(state: GameState, expectedVersion: number): Promise<CommitResult>;
  /**
   * Publie la vue partagée sur le canal de la partie.
   *
   * C'est ce qui remplace « la version a changé, redemande » par « voilà l'état
   * d'après ». Les autres téléphones n'ont plus rien à aller chercher.
   */
  publish(state: GameState): Promise<void>;
}

function supabaseBackend(url: string, key: string): Backend {
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Un appel à la base, borné dans le temps et retenté si le transport lâche.
   *
   * `tries` dit combien de fois l'appel peut être répété **sans rien changer au
   * monde** : deux pour une lecture, une seule pour une écriture, dont
   * l'appelant doit d'abord aller vérifier si elle est passée.
   */
  async function call(
    fn: string,
    args: Record<string, unknown>,
    what: string,
    tries: number,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    let last = '';
    for (let attempt = 0; attempt < tries; attempt++) {
      const { data, error, status } = await db
        .rpc(fn, args)
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (!error || !isTransient(status, error.message)) return { data, error };
      last = `${what} (${status || 'pas de réponse'}) : ${error.message}`;
      // Une pause courte : la seconde tentative repart souvent sur une
      // connexion déjà rouverte, et le coup est encore à l'écran.
      if (attempt + 1 < tries) await new Promise((r) => setTimeout(r, 120));
    }
    throw new TransientError(last);
  }

  return {
    async create(code, state) {
      const { data, error } = await call(
        'skyjo_create_game',
        { p_code: code, p_state: state },
        'Création',
        2,
      );
      if (!error) return { id: data as string };
      // Violation d'unicité. Deux cas, une seule conduite : le code est déjà
      // pris par une autre partie, ou par notre propre première tentative dont
      // la réponse s'est perdue. Dans les deux cas `createRoom` retire un code
      // et recommence ; la partie fantôme, s'il y en a une, sera purgée.
      if (error.code === '23505') return 'code-taken';
      throw new GameError(`Création impossible : ${error.message}`, 500);
    },
    async load(code) {
      const { data, error } = await call(
        'skyjo_load_game',
        { p_code: normalizeCode(code) },
        'Lecture',
        2,
      );
      if (error) throw new GameError(`Lecture impossible : ${error.message}`, 500);
      return (data as GameState | null) ?? null;
    },
    async commit(state, expectedVersion) {
      let data: unknown;
      try {
        // Une seule tentative : une écriture qui ne répond pas a pu passer, et
        // seul l'appelant sait comment lever le doute (cf. `writeId`).
        const answer = await call(
          'skyjo_commit_state',
          { p_game_id: state.id, p_expected_version: expectedVersion, p_state: state },
          'Écriture',
          1,
        );
        if (answer.error) throw new GameError(`Écriture impossible : ${answer.error.message}`, 500);
        data = answer.data;
      } catch (error) {
        if (error instanceof TransientError) return { outcome: 'silent' };
        throw error;
      }
      // Anciennes bases : la fonction rendait un booléen nu. Le coup se rejoue
      // alors comme avant, sur un état relu — c'est plus lent, pas faux.
      if (data === true) return { outcome: 'written' };
      if (data === false) return { outcome: 'stale', state: null };
      const result = data as { ok?: boolean; state?: GameState } | null;
      if (result?.ok) return { outcome: 'written' };
      return { outcome: 'stale', state: result?.state ?? null };
    },

    /**
     * Diffusion par l'API REST de Realtime, pas par une socket.
     *
     * Une fonction serverless ne vit pas assez longtemps pour entretenir une
     * connexion : elle la monterait à chaque coup, ce qui coûterait plus cher
     * que ce que la diffusion fait gagner. Une requête, et c'est parti.
     */
    async publish(state) {
      const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { topic: gameChannel(state.code), event: VIEW_EVENT, payload: toSharedView(state) },
          ],
        }),
        // Cette requête part après la réponse au joueur, mais elle tient la
        // fonction en vie tant qu'elle dure : sans borne, une diffusion qui ne
        // répond pas fait payer son silence à la requête suivante.
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Une diffusion ratée n'est pas une erreur de jeu : le coup est écrit,
        // et le filet de sondage des clients rattrapera. On le note, sans plus.
        console.warn('[skyjo] diffusion impossible :', response.status);
      }
    },
  };
}

/** Repli de développement : tout tient dans le processus, rien ne survit au redémarrage. */
function memoryBackend(): Backend {
  const games = new Map<string, GameState>();

  return {
    async create(code, state) {
      if (games.has(code)) return 'code-taken';
      const id = crypto.randomUUID();
      games.set(code, { ...state, id });
      return { id };
    },
    async load(code) {
      const state = games.get(normalizeCode(code));
      return state ? structuredClone(state) : null;
    },
    async commit(state, expectedVersion) {
      const current = games.get(state.code);
      if (!current) return { outcome: 'stale', state: null };
      if (current.version !== expectedVersion) {
        return { outcome: 'stale', state: structuredClone(current) };
      }
      games.set(state.code, structuredClone(state));
      return { outcome: 'written' };
    },
    // Pas de temps réel sans Supabase : en développement, les onglets se
    // rattrapent au sondage.
    async publish() {},
  };
}

let backend: Backend | undefined;

function db(): Backend {
  if (backend) return backend;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    backend = supabaseBackend(url, key);
  } else if (process.env.NODE_ENV === 'production') {
    throw new GameError(
      'Configuration manquante : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.',
      500,
    );
  } else {
    console.warn('[skyjo] Supabase non configuré : parties gardées en mémoire (dev uniquement).');
    backend = memoryBackend();
  }
  return backend;
}

/**
 * Installe un dos à la main. Réservé aux tests.
 *
 * C'est la seule façon de faire répondre la base comme elle répond quand elle
 * va mal — une écriture qui part sans revenir — sans attendre qu'un joueur en
 * fasse les frais. Passer `undefined` rend le choix au code normal.
 */
export function installBackend(next: Backend | undefined) {
  backend = next;
  recent.clear();
}

// ---------------------------------------------------------------------------
// API métier
// ---------------------------------------------------------------------------

export interface PlayerIdentity {
  playerId: string;
  name: string;
  emoji: string;
}

/** Crée une partie et renvoie la vue de son hôte. Réessaie si le code est déjà pris. */
export async function createRoom(host: PlayerIdentity): Promise<GameView> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const state = createGame({
      id: '00000000-0000-0000-0000-000000000000', // remplacé par l'identifiant réel
      code,
      host: { id: host.playerId, name: host.name, emoji: host.emoji },
    });

    const created = await db().create(code, state);
    if (created !== 'code-taken') {
      return toView(remember({ ...state, id: created.id }), host.playerId);
    }
  }
  throw new GameError('Impossible de générer un code de partie libre.', 500);
}

/**
 * Renvoie la partie telle que ce joueur a le droit de la voir.
 *
 * `since` est la dernière version qu'il connaît : elle ne change rien à ce
 * qu'il voit, seulement aux coups qu'on lui rejoue en animation.
 */
export async function getView(code: string, playerId: string, since?: number): Promise<GameView> {
  const state = await db().load(code);
  if (!state) throw new GameError('Cette partie n’existe pas (ou plus).', 404);
  remember(state);
  return toView(state, playerId, since);
}

// ---------------------------------------------------------------------------
// Mémoire du processus
// ---------------------------------------------------------------------------

/**
 * Les parties vues récemment, gardées dans le processus.
 *
 * Un coup faisait deux allers-retours vers la base : relire, puis écrire. Le
 * premier est évitable — et sans le moindre pari sur la fraîcheur du cache,
 * parce que ce n'est pas lui qui garantit la correction : c'est le verrou
 * optimiste. `commit` n'écrit que si la version en base est encore celle sur
 * laquelle on a joué. Un cache périmé ne produit donc pas un état faux, il
 * produit un refus — et le refus rapporte l'état frais, sur lequel le coup se
 * rejoue. Le pire cas du cache est le cas normal d'avant.
 *
 * Chaque instance a le sien, et c'est très bien : deux instances qui divergent
 * se départagent en base, comme deux joueurs.
 */
const CACHE_LIMIT = 256;
const recent = new Map<string, GameState>();

function remember(state: GameState): GameState {
  const key = normalizeCode(state.code);
  recent.delete(key);
  recent.set(key, state);
  // La plus ancienne consultée s'en va : une partie oubliée se relit, elle ne
  // se perd pas.
  if (recent.size > CACHE_LIMIT) recent.delete(recent.keys().next().value!);
  return state;
}

function forget(code: string) {
  recent.delete(normalizeCode(code));
}

/** Publie le coup aux autres téléphones, une fois la réponse partie. */
function announce(state: GameState) {
  const sent = () =>
    db()
      .publish(state)
      .catch((error) => console.warn('[skyjo] diffusion impossible :', error));
  try {
    // Hors du chemin de la réponse : celui qui joue ne doit pas attendre que
    // les autres soient prévenus.
    after(sent);
  } catch {
    // Hors contexte de requête (tests, scripts) : on envoie sur-le-champ.
    void sent();
  }
}

/**
 * Applique une action de façon atomique.
 *
 * Verrou optimiste : on joue sur l'état qu'on a — celui du cache, sinon celui
 * de la base — puis on écrit à condition que la version n'ait pas bougé. Si
 * deux joueurs agissent en même temps, le perdant reçoit l'état frais avec son
 * refus et rejoue dessus ; le moteur le refusera proprement si ce n'était plus
 * son tour.
 *
 * Un coup refusé par le moteur sur un état venu du cache n'est pas une réponse :
 * ce cache peut avoir un tour de retard, et « ce n'est pas ton tour » serait
 * alors un mensonge. On relit avant de trancher. Seul un refus prononcé sur un
 * état frais est rendu au joueur.
 *
 * Enfin, une écriture peut ne pas répondre du tout — la passerelle renonce au
 * bout de cinq secondes, et ça arrive pour de vrai. Ce n'est pas un coup perdu :
 * on relit, on regarde si le coup porte notre marque, et on ne le rejoue que
 * s'il n'est pas passé. Un tel silence coûtait jusqu'ici le coup du joueur et
 * un bandeau rouge.
 */
export async function performAction(
  code: string,
  playerId: string,
  action: Action,
): Promise<GameView> {
  let state = recent.get(normalizeCode(code)) ?? null;
  let fresh = state === null;
  if (!state) state = await db().load(code);
  const deadline = Date.now() + ACTION_BUDGET_MS;

  try {
    for (let attempt = 0; attempt < MAX_COMMIT_RETRIES; attempt++) {
      // Six tentatives peuvent durer plus longtemps que la fonction n'a le droit
      // de vivre. Mieux vaut rendre la main en disant « réessaie » qu'être coupé
      // au milieu d'un coup : le joueur voit la même chose, mais lui peut agir.
      if (attempt > 0 && Date.now() > deadline) {
        throw new TransientError(`Action ${action.type} : plus de temps (${attempt} tentatives).`);
      }
      if (!state) throw new GameError('Cette partie n’existe pas (ou plus).', 404);

      const result = applyAction(state, { ...action, playerId } as Action);
      if (!result.ok) {
        if (fresh) throw new GameError(result.error, 409);
        state = await db().load(code);
        fresh = true;
        if (state) remember(state);
        continue;
      }

      // Le moteur a reconnu un doublon : l'action était déjà jouée, l'état
      // revient inchangé (cf. `alreadyDone`). Il n'y a rien à écrire et rien à
      // diffuser — mais encore faut-il que ce soit vrai, et un état sorti du
      // cache peut avoir un tour de retard. Même précaution que pour un refus :
      // on ne tranche que sur du frais.
      if (result.state.version === state.version) {
        if (!fresh) {
          state = await db().load(code);
          fresh = true;
          if (state) remember(state);
          continue;
        }
        return toView(state, playerId);
      }

      const stamped: Stamped = { ...result.state, writeId: crypto.randomUUID() };
      const written = await db().commit(stamped, state.version);

      if (written.outcome === 'written') {
        remember(stamped);
        announce(stamped);
        return toView(stamped, playerId);
      }

      if (written.outcome === 'silent') {
        // L'écriture n'a pas répondu, et la suite dépend de savoir si elle a eu
        // lieu : la base seule peut le dire, et c'est la marque qui la fait
        // parler. Sans elle, trouver la version attendue ne prouverait rien —
        // l'adversaire a pu écrire le même numéro pendant ce temps.
        const after = await db().load(code);
        if (after && stampOf(after) === stamped.writeId) {
          // Elle était passée. Il ne manquait que la réponse — et la diffusion,
          // qui n'était pas partie non plus.
          remember(after);
          announce(after);
          return toView(after, playerId);
        }
        state = after;
        fresh = true;
        if (state) remember(state);
        continue;
      }

      // Quelqu'un a joué entre-temps. L'état frais vient avec le refus quand la
      // base sait le rendre ; sinon on va le chercher.
      state = written.state ?? (await db().load(code));
      fresh = true;
      if (state) remember(state);
    }
  } catch (error) {
    // Un coup refusé par le moteur ne dit rien de mauvais sur l'état : il a été
    // prononcé sur un état frais, qui reste bon à garder. Tout le reste — une
    // écriture qui échoue, une lecture qui tombe — laisse un doute sur ce que
    // la base contient, et le doute se lève en relisant.
    if (!(error instanceof GameError) || error.status !== 409) forget(code);
    throw error;
  }
  throw new GameError('La partie bouge trop vite, réessaie.', 503);
}
