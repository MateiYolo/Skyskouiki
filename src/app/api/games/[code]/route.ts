import { actionRequestSchema } from '@/lib/server/schema';
import { fail, ok } from '@/lib/server/respond';
import { GameError, getView, performAction } from '@/lib/server/store';
import type { Action } from '@/lib/skyjo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La région, elle, se règle dans `vercel.json` — pas ici.
 *
 * Un coup fait un ou deux appels à Supabase, l'un après l'autre. Posés de
 * l'autre côté d'un océan, ils coûtent à eux seuls plus que tout le reste du
 * tour, et ils traînent une queue de latence qui finit en « Gateway Timeout ».
 * Le trajet téléphone → fonction, lui, ne se fait qu'une fois et se voit
 * beaucoup moins : la fonction doit donc être à côté de la base, à Paris.
 *
 * `preferredRegion` a longtemps été l'endroit où le dire. Ce n'en est plus un :
 * Next le déprécie, et le plan Hobby de Vercel ignore de toute façon toute
 * région demandée fonction par fonction — il n'en applique qu'une, à tout le
 * projet. D'où `vercel.json`. Ça se vérifie sur n'importe quelle réponse :
 * l'en-tête `x-vercel-id` commence par la région qui a servi.
 */

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
