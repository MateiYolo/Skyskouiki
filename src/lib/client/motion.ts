/**
 * Le vocabulaire de mouvement de l'application.
 *
 * Une seule courbe, qui décélère et ne dépasse jamais sa cible : un rebond
 * n'apprend rien au joueur, il retarde juste le moment où il peut lire. Cinq
 * durées, selon ce que le mouvement doit dire :
 *
 *   - `SNAP`   : « ton geste est pris en compte » — retour tactile immédiat ;
 *   - `MOVE`   : « cet élément d'interface change » — un habillage qui suit ;
 *   - `SETTLE` : « voilà ce qui vient de se produire » — le temps de le voir ;
 *   - `FLIP`   : « cette carte se retourne » — assez lent pour qu'on voie la face tourner ;
 *   - `FLIGHT` : « cette carte est passée d'ici à là » — un trajet à suivre des yeux.
 *
 * Tout ce qui ne rentre dans aucune des cinq n'a probablement pas à bouger.
 *
 * Les deux dernières sont les seules que le joueur *regarde* : elles portent
 * une information de jeu (quelle carte, prise où, posée où) qu'aucun texte ne
 * remplace. Elles sont donc franchement plus lentes que le reste de
 * l'interface — un déplacement qu'on ne peut pas suivre du regard ne raconte
 * rien, il se contente de changer l'écran.
 */

import type { Transition } from 'motion/react';

/** Décélération franche, sans dépassement. */
export const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];

/**
 * Une carte qui traverse le terrain part et arrive posément : elle accélère,
 * puis freine. Sans l'accélération du départ, le trajet semble commencer avant
 * le geste qui le provoque.
 */
export const EASE_TRAVEL: [number, number, number, number] = [0.35, 0, 0.15, 1];

export const SNAP: Transition = { duration: 0.14, ease: EASE_OUT };
export const MOVE: Transition = { duration: 0.24, ease: EASE_OUT };
export const SETTLE: Transition = { duration: 0.34, ease: EASE_OUT };

/** Un retournement de carte, assez lent pour qu'on voie la face arriver. */
export const FLIP: Transition = { duration: 0.42, ease: EASE_OUT };

// --- trajets de cartes ------------------------------------------------------

/** Durée d'un trajet de carte, d'un bout à l'autre du terrain. */
export const FLIGHT_DURATION = 0.5;

/** Le temps de poser la première carte avant que la suivante ne parte. */
export const FLIGHT_GAP = 0.12;

/** Deux trajets qui s'enchaînent : la seconde carte part quand la première est posée. */
export const FLIGHT_NEXT = FLIGHT_DURATION + FLIGHT_GAP;

/**
 * Le temps qu'un groupe éliminé reste sous les yeux avant de partir à la
 * défausse. C'est le seul moment où l'on peut voir *lesquelles* de ses cartes
 * sautent, et pourquoi : elles ont déjà disparu de l'état du jeu.
 */
export const CLEAR_HOLD = 0.45;

/** Décalage entre deux cartes d'un même groupe : elles partent en éventail. */
export const CLEAR_STAGGER = 0.07;

export const FLIGHT: Transition = { duration: FLIGHT_DURATION, ease: EASE_TRAVEL };
