import { z } from 'zod';
import { GRID_SIZE } from '@/lib/skyjo';

/** Caractères de contrôle, invisibles ou non assignés (catégorie Unicode « C »). */
const INVISIBLE = /\p{C}/gu;

/** Nettoie une saisie libre : pas d'invisibles, pas d'espaces autour, longueur bornée. */
const clean = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(INVISIBLE, '').trim().slice(0, max))
    .refine((v) => v.length > 0, 'Champ vide');

const gridIndex = z.number().int().min(0).max(GRID_SIZE - 1);

export const identitySchema = z.object({
  playerId: z.string().min(8).max(64),
  name: clean(16),
  emoji: clean(8),
});

/**
 * Le `playerId` de l'action n'est jamais lu depuis le corps de l'action : il est
 * réinjecté par la route à partir de l'identité de la requête.
 */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: clean(16), emoji: clean(8) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('setVariant'), variant: z.enum(['classic', 'spicy']) }),
  z.object({ type: z.literal('startGame') }),
  z.object({ type: z.literal('flipInitial'), index: gridIndex }),
  z.object({ type: z.literal('drawFromPile') }),
  z.object({ type: z.literal('takeDiscard') }),
  z.object({ type: z.literal('placeCard'), index: gridIndex }),
  z.object({ type: z.literal('discardHeld') }),
  z.object({ type: z.literal('flipCard'), index: gridIndex }),
  z.object({
    type: z.literal('steal'),
    index: gridIndex,
    // La cible est bornée comme un identifiant de joueur, jamais lue comme un
    // index : le moteur la cherche dans la partie et refuse ce qu'il ne trouve pas.
    targetPlayerId: z.string().min(8).max(64),
    targetIndex: gridIndex,
  }),
  z.object({ type: z.literal('declineSteal') }),
  // La Valse ne quitte jamais ma grille : deux index, et rien d'autre à borner.
  z.object({ type: z.literal('swap'), index: gridIndex, otherIndex: gridIndex }),
  z.object({ type: z.literal('declineSwap') }),
  z.object({ type: z.literal('nextRound') }),
  z.object({ type: z.literal('playAgain') }),
]);

export const actionRequestSchema = z.object({
  playerId: z.string().min(8).max(64),
  action: actionSchema,
});
