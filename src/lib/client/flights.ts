'use client';

import type { GameView } from '@/lib/skyjo';
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
 * l'exécute, et ignore ensuite les événements dont je suis l'auteur.
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
        { from: to, to: DISCARD_PILE, value: cell.faceUp ? cell.value : null, delay: 0.16 },
      ];
    }

    default:
      return [];
  }
}

/** Ce qui doit voler quand *quelqu'un d'autre* vient de jouer. */
export function flightsForEvents(view: GameView): FlightRequest[] {
  const out: FlightRequest[] = [];

  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
        // Mes propres coups ont déjà volé, au doigt.
        if (view.currentPlayerId === view.you.id) break;
        out.push({ from: event.from === 'draw' ? DRAW_PILE : DISCARD_PILE, to: HAND, value: view.heldCard, delay: 0 });
        break;
      case 'placed': {
        if (event.playerId === view.you.id) break;
        const to = cellAnchor(event.playerId, event.index);
        out.push({ from: HAND, to, value: event.placed, delay: 0 });
        out.push({ from: to, to: DISCARD_PILE, value: event.discarded, delay: 0.16 });
        break;
      }
      case 'discarded':
        if (event.playerId === view.you.id) break;
        out.push({ from: HAND, to: DISCARD_PILE, value: event.value, delay: 0 });
        break;
      default:
        break;
    }
  }

  return out;
}
