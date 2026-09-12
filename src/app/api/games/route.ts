import { identitySchema } from '@/lib/server/schema';
import { fail, ok } from '@/lib/server/respond';
import { GameError, createRoom } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Crée une partie. Le créateur en devient l'hôte. */
export async function POST(request: Request) {
  try {
    const parsed = identitySchema.safeParse(await request.json());
    if (!parsed.success) throw new GameError('Requête invalide.', 400);
    return ok(await createRoom(parsed.data));
  } catch (error) {
    return fail(error);
  }
}
