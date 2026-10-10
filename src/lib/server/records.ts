import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BOARD_SIZE, rankBoard, type HallOfFame, type RecordEntry } from '@/lib/records';
import { GameError, finalStanding, type FinalStanding } from './store';

/**
 * Le tableau des records, côté serveur.
 *
 * Il vit à part du magasin des parties, et c'est voulu : il n'est pas sur le
 * chemin d'un coup, il n'a ni verrou ni cache, et une panne ici ne doit rien
 * coûter à la partie en cours. Même repli qu'ailleurs — la mémoire du processus
 * en développement, refusée en production.
 */

const TIMEOUT_MS = 2500;

interface RecordsBackend {
  record(entry: FinalStanding & { initials: string }): Promise<string>;
  board(): Promise<HallOfFame>;
}

function supabaseRecords(url: string, key: string): RecordsBackend {
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(fn, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) {
      console.warn('[skyjo] records :', error.message);
      throw new GameError('Le tableau des records ne répond pas.', 503);
    }
    return data;
  }

  return {
    async record(entry) {
      return (await call('skyjo_record_score', { p_entry: entry })) as string;
    },
    async board() {
      const data = (await call('skyjo_hall_of_fame', { p_size: BOARD_SIZE })) as HallOfFame | null;
      return { best: data?.best ?? [], shame: data?.shame ?? [] };
    },
  };
}

function memoryRecords(): RecordsBackend {
  const rows = new Map<string, RecordEntry & { busted: boolean }>();

  return {
    async record(entry) {
      const key = `${entry.gameId}:${entry.playerId}:${entry.rounds}:${entry.score}`;
      const previous = rows.get(key);
      const row = {
        id: previous?.id ?? crypto.randomUUID(),
        initials: entry.initials,
        score: entry.score,
        busted: entry.busted,
        rounds: entry.rounds,
        players: entry.players,
        spicy: entry.spicy,
        at: previous?.at ?? Date.now(),
      };
      rows.set(key, row);
      return row.id;
    },
    async board() {
      const all = [...rows.values()];
      const strip = (row: RecordEntry & { busted: boolean }): RecordEntry => {
        const entry: Partial<typeof row> = { ...row };
        delete entry.busted;
        return entry as RecordEntry;
      };
      return {
        best: rankBoard('best', all.filter((r) => !r.busted)).map(strip),
        shame: rankBoard('shame', all.filter((r) => r.busted)).map(strip),
      };
    },
  };
}

let backend: RecordsBackend | undefined;

function records(): RecordsBackend {
  if (backend) return backend;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) backend = supabaseRecords(url, key);
  else if (process.env.NODE_ENV === 'production') {
    throw new GameError('Configuration manquante pour le tableau des records.', 500);
  } else backend = memoryRecords();
  return backend;
}

export function hallOfFame(): Promise<HallOfFame> {
  return records().board();
}

/**
 * Grave les initiales d'un joueur à côté du score qu'il a vraiment fait.
 *
 * On inscrit même un score qui n'entre pas dans les dix : le tableau se
 * calcule à la lecture, et un record battu demain par quelqu'un d'autre n'a
 * pas à être réinscrit. Rend le tableau à jour et l'identifiant de la ligne,
 * pour que l'écran puisse la faire clignoter.
 */
export async function recordScore(
  code: string,
  playerId: string,
  initials: string,
): Promise<{ id: string; fame: HallOfFame }> {
  const standing = await finalStanding(code, playerId);
  const id = await records().record({ ...standing, initials });
  return { id, fame: await records().board() };
}
