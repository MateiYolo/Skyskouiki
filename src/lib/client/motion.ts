/**
 * Le vocabulaire de mouvement de l'application.
 *
 * Une seule courbe, qui décélère et ne dépasse jamais sa cible : un rebond
 * n'apprend rien au joueur, il retarde juste le moment où il peut lire. Trois
 * durées, selon ce que le mouvement doit dire :
 *
 *   - `SNAP`   : « ton geste est pris en compte » — retour tactile immédiat ;
 *   - `MOVE`   : « cette carte est passée d'ici à là » — un déplacement à suivre ;
 *   - `SETTLE` : « voilà ce qui vient de se produire » — le temps de le voir.
 *
 * Tout ce qui ne rentre dans aucune des trois n'a probablement pas à bouger.
 */

import type { Transition } from 'motion/react';

/** Décélération franche, sans dépassement. */
export const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];

export const SNAP: Transition = { duration: 0.14, ease: EASE_OUT };
export const MOVE: Transition = { duration: 0.24, ease: EASE_OUT };
export const SETTLE: Transition = { duration: 0.34, ease: EASE_OUT };
