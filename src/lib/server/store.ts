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
const MAX_COMMIT_RETRIES = 6;

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
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
 * Le résultat d'une écriture sous verrou optimiste.
 *
 * En cas de collision, l'état frais accompagne le refus : sans lui, rejouer
 * son coup coûtait une relecture complète — un aller-retour de plus, sur le
 * chemin le plus chaud du jeu.
 */
type CommitResult = { ok: true } | { ok: false; state: GameState | null };

interface Backend {
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

  return {
    async create(code, state) {
      const { data, error } = await db.rpc('skyjo_create_game', { p_code: code, p_state: state });
      if (!error) return { id: data as string };
      if (error.code === '23505') return 'code-taken'; // violation d'unicité
      throw new GameError(`Création impossible : ${error.message}`, 500);
    },
    async load(code) {
      const { data, error } = await db.rpc('skyjo_load_game', { p_code: normalizeCode(code) });
      if (error) throw new GameError(`Lecture impossible : ${error.message}`, 500);
      return (data as GameState | null) ?? null;
    },
    async commit(state, expectedVersion) {
      const { data, error } = await db.rpc('skyjo_commit_state', {
        p_game_id: state.id,
        p_expected_version: expectedVersion,
        p_state: state,
      });
      if (error) throw new GameError(`Écriture impossible : ${error.message}`, 500);
      // Anciennes bases : la fonction rendait un booléen nu. Le coup se rejoue
      // alors comme avant, sur un état relu — c'est plus lent, pas faux.
      if (data === true) return { ok: true };
      if (data === false) return { ok: false, state: null };
      const result = data as { ok?: boolean; state?: GameState } | null;
      if (result?.ok) return { ok: true };
      return { ok: false, state: result?.state ?? null };
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
      if (!current) return { ok: false, state: null };
      if (current.version !== expectedVersion) return { ok: false, state: structuredClone(current) };
      games.set(state.code, structuredClone(state));
      return { ok: true };
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
 */
export async function performAction(
  code: string,
  playerId: string,
  action: Action,
): Promise<GameView> {
  let state = recent.get(normalizeCode(code)) ?? null;
  let fresh = state === null;
  if (!state) state = await db().load(code);

  try {
    for (let attempt = 0; attempt < MAX_COMMIT_RETRIES; attempt++) {
      if (!state) throw new GameError('Cette partie n’existe pas (ou plus).', 404);

      const result = applyAction(state, { ...action, playerId } as Action);
      if (!result.ok) {
        if (fresh) throw new GameError(result.error, 409);
        state = await db().load(code);
        fresh = true;
        if (state) remember(state);
        continue;
      }

      const written = await db().commit(result.state, state.version);
      if (written.ok) {
        remember(result.state);
        announce(result.state);
        return toView(result.state, playerId);
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
