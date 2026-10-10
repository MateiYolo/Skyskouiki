import { recordRequestSchema } from '@/lib/server/schema';
import { fail, ok } from '@/lib/server/respond';
import { recordScore } from '@/lib/server/records';
import { GameError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

/**
 * Grave des initiales au tableau des records.
 *
 * Le corps ne porte que les lettres : le score se lit dans la partie terminée,
 * côté serveur. C'est la seule vérification qui vaille — le reste, on s'en fiche.
 */
export async function POST(request: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const parsed = recordRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new GameError('Initiales invalides.', 400);
    return ok(await recordScore(code, parsed.data.playerId, parsed.data.initials));
  } catch (error) {
    return fail(error);
  }
}
