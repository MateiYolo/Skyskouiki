import 'server-only';
import { GameError } from './store';

export function ok(body: unknown) {
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}

/** Traduit une erreur en réponse JSON, sans jamais fuiter de détail interne. */
export function fail(error: unknown) {
  if (error instanceof GameError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error('[skyjo]', error);
  return Response.json({ error: 'Erreur interne.' }, { status: 500 });
}
