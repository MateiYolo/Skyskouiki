import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CODE_LENGTH } from '@/lib/code';
import { applyAction, createGame, toView, type Action, type GameState, type GameView } from '@/lib/skyjo';

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

interface Backend {
  create(code: string, state: GameState): Promise<{ id: string } | 'code-taken'>;
  load(code: string): Promise<GameState | null>;
  /** Écrit seulement si la version en base est encore `expectedVersion`. */
  commit(state: GameState, expectedVersion: number): Promise<boolean>;
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
      return data === true;
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
      if (!current || current.version !== expectedVersion) return false;
      games.set(state.code, structuredClone(state));
      return true;
    },
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
    if (created !== 'code-taken') return toView({ ...state, id: created.id }, host.playerId);
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
  return toView(state, playerId, since);
}

/**
 * Applique une action de façon atomique.
 *
 * Verrou optimiste : on relit l'état, on applique, puis on écrit à condition que
 * la version n'ait pas bougé. Si deux joueurs agissent en même temps, le perdant
 * rejoue son action sur l'état frais — et se fait proprement refuser par le
 * moteur si ce n'était plus son tour.
 */
export async function performAction(
  code: string,
  playerId: string,
  action: Action,
): Promise<GameView> {
  for (let attempt = 0; attempt < MAX_COMMIT_RETRIES; attempt++) {
    const state = await db().load(code);
    if (!state) throw new GameError('Cette partie n’existe pas (ou plus).', 404);

    const result = applyAction(state, { ...action, playerId } as Action);
    if (!result.ok) throw new GameError(result.error, 409);

    if (await db().commit(result.state, state.version)) {
      return toView(result.state, playerId);
    }
  }
  throw new GameError('La partie bouge trop vite, réessaie.', 503);
}
