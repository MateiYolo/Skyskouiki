import { actionRequestSchema } from '@/lib/server/schema';
import { fail, ok } from '@/lib/server/respond';
import { GameError, getView, performAction } from '@/lib/server/store';
import type { Action } from '@/lib/skyjo';

export const runtime = 'nodejs';
/**
 * La fonction tourne à côté de la base, pas à côté du joueur.
 *
 * Un coup fait deux appels à Supabase, l'un après l'autre. Posés de l'autre
 * côté d'un océan, ils coûtent à eux seuls plus que tout le reste du tour — et
 * c'est invisible en développement, où tout est sur la même machine. Le trajet
 * téléphone → fonction, lui, ne se fait qu'une fois et se voit beaucoup moins.
 *
 * `fra1` est Francfort ; `cdg1` (Paris) revient au même à dix millisecondes
 * près. Ce qui compte, c'est que ce soit la région du projet Supabase.
 */
export const preferredRegion = 'fra1';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

/** Renvoie la partie telle que ce joueur a le droit de la voir. */
export async function GET(request: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const params = new URL(request.url).searchParams;
    const playerId = params.get('playerId');
    if (!playerId) throw new GameError('Joueur non identifié.', 400);
    // Dernière version connue du client : sert à lui rejouer les coups qu'il a
    // ratés, pas à lui en montrer davantage.
    const since = Number(params.get('since'));
    return ok(await getView(code, playerId, Number.isSafeInteger(since) && since > 0 ? since : undefined));
  } catch (error) {
    return fail(error);
  }
}

/** Applique une action et renvoie la nouvelle vue. */
export async function POST(request: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const parsed = actionRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new GameError('Action invalide.', 400);
    const { playerId, action } = parsed.data;
    return ok(await performAction(code, playerId, { ...action, playerId } as Action));
  } catch (error) {
    return fail(error);
  }
}
