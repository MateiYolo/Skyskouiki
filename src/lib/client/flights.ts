'use client';

import type { GameView } from '@/lib/skyjo';
import {
  CLEAR_HOLD,
  CLEAR_STAGGER,
  FLIGHT_DURATION,
  FLIGHT_NEXT,
  FLIP,
} from './motion';
import type { ClientAction } from './actions';

/**
 * Les trajets de cartes, et qui les déclenche.
 *
 * Deux sources, et il faut les deux :
 *
 *   - **mes propres coups** partent au doigt, sans attendre le réseau. Sinon la
 *     carte arriverait dans sa case avant de l'avoir survolée, et le trajet se
 *     lirait comme un ressac plutôt que comme un geste ;
 *   - **les coups des autres** se déduisent des événements du serveur, à leur
 *     arrivée — c'est le seul moment où on les apprend.
 *
 * D'où ce petit canal : `useGame` demande un vol au moment du tap, `FlightLayer`
 * l'exécute, et ignore ensuite les événements dont je suis l'auteur — sauf les
 * éliminations, que personne n'a pu anticiper puisqu'elles n'existent que dans
 * l'état d'après.
 *
 * Tout est daté. Un coup, ce n'est pas un ensemble de cartes qui bougent en
 * même temps, c'est une suite : je prends, je pose, ce que je remplace s'en
 * va, et la colonne saute. Jouées ensemble, ces quatre choses sont un
 * clignotement ; jouées l'une après l'autre, elles se racontent.
 */

/** Emplacements nommés, déclarés en `data-anchor` par les composants. */
export const DRAW_PILE = 'pile-draw';
export const DISCARD_PILE = 'pile-discard';
export const HAND = 'hand';
export const cellAnchor = (playerId: string, index: number) => `cell-${playerId}-${index}`;

export interface FlightRequest {
  from: string;
  to: string;
  /** `null` = carte face cachée : on sait qu'elle bouge, pas ce qu'elle vaut. */
  value: number | null;
  delay: number;
}

type Listener = (requests: FlightRequest[]) => void;

const listeners = new Set<Listener>();

export function requestFlights(requests: FlightRequest[]) {
  if (!requests.length) return;
  for (const listener of listeners) listener(requests);
}

export function onFlights(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ce qui doit voler quand *je* joue ce coup, connu avant même de l'envoyer. */
export function flightsForAction(
  view: GameView,
  action: ClientAction,
  playerId: string,
): FlightRequest[] {
  switch (action.type) {
    case 'drawFromPile':
      return [{ from: DRAW_PILE, to: HAND, value: null, delay: 0 }];

    case 'takeDiscard':
      return view.discardTop === null
        ? []
        : [{ from: DISCARD_PILE, to: HAND, value: view.discardTop, delay: 0 }];

    case 'discardHeld':
      return view.heldCard === null
        ? []
        : [{ from: HAND, to: DISCARD_PILE, value: view.heldCard, delay: 0 }];

    case 'placeCard': {
      if (view.heldCard === null) return [];
      const cell = view.players.find((p) => p.id === playerId)?.grid[action.index];
      if (cell === undefined || cell === null) return [];
      const to = cellAnchor(playerId, action.index);
      return [
        { from: HAND, to, value: view.heldCard, delay: 0 },
        // La carte remplacée part toujours, même quand on ignore encore sa
        // valeur : voir une carte quitter sa grille pour la défausse est
        // justement ce qui rend l'échange lisible. Face cachée en attendant —
        // le serveur révélera le sommet de la défausse à sa réponse.
        // Elle attend que la première soit posée : deux cartes qui se croisent
        // au milieu de la table, c'est un échange qu'on ne peut plus suivre.
        { from: to, to: DISCARD_PILE, value: cell.faceUp ? cell.value : null, delay: FLIGHT_NEXT },
      ];
    }

    default:
      return [];
  }
}

/**
 * Le moment où le terrain redevient calme, ce lot d'événements joué.
 *
 * Sert à faire attendre les éliminations : une colonne qui saute pendant que
 * la carte qui l'a complétée est encore en vol, c'est trois disparitions sans
 * cause visible. On la laisse arriver, on marque un temps, puis les cartes
 * s'en vont.
 *
 * Mes propres échanges ont déjà décollé au doigt : ils sont un peu plus
 * avancés que ce compte ne le dit, le temps de l'aller-retour réseau. Attendre
 * la même échéance leur laisse simplement un peu de rab.
 */
function settledAt(view: GameView): number {
  let t = 0;
  const at = (d: number) => {
    t = Math.max(t, d);
  };
  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
      case 'discarded':
        at(FLIGHT_DURATION);
        break;
      case 'placed':
        at(FLIGHT_NEXT + FLIGHT_DURATION);
        break;
      case 'flipped':
      case 'initialFlip':
        at(FLIP.duration as number);
        break;
      default:
        break;
    }
  }
  return t;
}

/** Quand les cartes d'un groupe éliminé quittent la grille, ce lot joué. */
export function clearDelay(view: GameView): number {
  return settledAt(view) + CLEAR_HOLD;
}

/** Le temps de lire une table qui vient de se retourner en entier. */
const READ_BOARD = 1.6;

/**
 * Combien de temps (en millisecondes) laisser la table sous les yeux avant
 * d'afficher les scores.
 *
 * La fin de manche est le seul moment où tout arrive d'un coup : le dernier
 * joueur pose sa carte, toutes les grilles se retournent, et les colonnes que
 * ça révèle sautent. Poser la feuille de scores par-dessus pendant que ça se
 * produit, c'est escamoter la seule chose que tout le monde attendait — ce
 * qu'il y avait sous les dernières cartes. On attend donc que le dernier
 * mouvement soit fini, et on laisse encore le temps de faire le tour des
 * grilles.
 */
export function revealHold(view: GameView): number {
  let widest = 0;
  for (const event of view.lastEvents) {
    if (event.type === 'groupCleared') widest = Math.max(widest, event.cells.length);
  }
  const flying = widest ? FLIGHT_DURATION + (widest - 1) * CLEAR_STAGGER : 0;
  return (clearDelay(view) + flying + READ_BOARD) * 1000;
}

/** Ce qui doit voler quand *quelqu'un d'autre* vient de jouer. */
export function flightsForEvents(view: GameView): FlightRequest[] {
  const out: FlightRequest[] = [];
  const cleared = clearDelay(view);

  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
        // Mes propres coups ont déjà volé, au doigt.
        if (view.currentPlayerId === view.you.id) break;
        out.push({
          from: event.from === 'draw' ? DRAW_PILE : DISCARD_PILE,
          to: HAND,
          value: view.heldCard,
          delay: 0,
        });
        break;
      case 'placed': {
        if (event.playerId === view.you.id) break;
        const to = cellAnchor(event.playerId, event.index);
        out.push({ from: HAND, to, value: event.placed, delay: 0 });
        out.push({ from: to, to: DISCARD_PILE, value: event.discarded, delay: FLIGHT_NEXT });
        break;
      }
      case 'discarded':
        if (event.playerId === view.you.id) break;
        out.push({ from: HAND, to: DISCARD_PILE, value: event.value, delay: 0 });
        break;
      // Une élimination, elle, se rejoue pour tout le monde — la mienne
      // comprise : personne ne l'a vue venir, elle n'existe que dans l'état
      // d'après. Les cartes restent en place le temps qu'on les lise
      // (`ClearGhost`), puis partent à la défausse l'une après l'autre.
      case 'groupCleared':
        event.cells.forEach((index, rank) => {
          out.push({
            from: cellAnchor(event.playerId, index),
            to: DISCARD_PILE,
            value: event.value,
            delay: cleared + rank * CLEAR_STAGGER,
          });
        });
        break;
      default:
        break;
    }
  }

  return out;
}
