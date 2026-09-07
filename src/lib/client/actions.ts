import type { Action } from '@/lib/skyjo';

/**
 * Une action telle que le navigateur l'envoie : sans `playerId`, que la route
 * réinjecte à partir de l'identité de la requête. Le client n'a jamais son mot
 * à dire sur l'identité de celui qui joue.
 */
export type ClientAction =
  | Omit<Extract<Action, { type: 'join' }>, 'playerId'>
  | { type: Exclude<Action['type'], 'join' | 'flipInitial' | 'placeCard' | 'flipCard'> }
  | { type: 'flipInitial' | 'placeCard' | 'flipCard'; index: number };
