import { fail, ok } from '@/lib/server/respond';
import { hallOfFame } from '@/lib/server/records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Les deux tableaux des records : les meilleurs, et la honte. */
export async function GET() {
  try {
    return ok(await hallOfFame());
  } catch (error) {
    return fail(error);
  }
}
