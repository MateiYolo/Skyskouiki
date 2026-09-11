import type { Action } from '@/lib/skyjo';

/**
 * Une action telle que le navigateur l'envoie : sans `playerId`, que la route
 * réinjecte à partir de l'identité de la requête. Le client n'a jamais son mot
 * à dire sur l'identité de celui qui joue.
 *
 * Dérivée membre par membre de `Action` plutôt que réécrite à la main : chaque
 * coup garde ainsi ses champs propres — l'index d'une case, la cible d'un vol —
 * et une action ajoutée au moteur n'a pas à être recopiée ici.
 */
type WithoutPlayer<A> = A extends { type: string } ? Omit<A, 'playerId'> : never;

export type ClientAction = WithoutPlayer<Action>;
