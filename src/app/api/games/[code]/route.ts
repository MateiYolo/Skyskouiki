import { actionRequestSchema } from '@/lib/server/schema';
import { fail, ok } from '@/lib/server/respond';
import { GameError, getView, performAction } from '@/lib/server/store';
import type { Action } from '@/lib/skyjo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

/** Renvoie la partie telle que ce joueur a le droit de la voir. */
export async function GET(request: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const playerId = new URL(request.url).searchParams.get('playerId');
    if (!playerId) throw new GameError('Joueur non identifié.', 400);
    return ok(await getView(code, playerId));
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
