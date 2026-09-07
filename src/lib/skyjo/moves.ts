import type { GameEvent } from './types';
import type { GameView } from './view';

/**
 * Le dernier coup joué, en clair.
 *
 * Savoir ce que l'adversaire vient de prendre et de jeter est la moitié du jeu :
 * c'est ce qui permet de préparer le sien. Rien n'est déduit ici — on ne fait
 * que mettre en mots des événements que le serveur diffuse déjà à tout le monde,
 * et qui ne portent que de l'information publique.
 */

export interface LastMove {
  playerId: string;
  /** Formulation courte, à la troisième personne : « prend le 4 ». */
  text: string;
}

function describe(event: GameEvent): string | null {
  switch (event.type) {
    case 'drew':
      return event.from === 'discard' ? 'prend la défausse' : 'pioche';
    case 'placed':
      return `pose ${event.placed}, jette ${event.discarded}`;
    case 'discarded':
      return `jette ${event.value}`;
    case 'flipped':
      return `retourne ${event.value}`;
    default:
      return null;
  }
}

/**
 * Le dernier coup contenu dans `lastEvents`.
 *
 * Le serveur ne garde que les événements de la dernière action : la phrase vaut
 * donc jusqu'au coup suivant, ce qui est exactement la durée pendant laquelle
 * elle sert.
 */
export function lastMove(view: GameView): LastMove | null {
  for (let i = view.lastEvents.length - 1; i >= 0; i--) {
    const event = view.lastEvents[i];
    const text = describe(event);
    if (text !== null && 'playerId' in event) {
      return { playerId: event.playerId, text };
    }
  }
  return null;
}

/** Ce que tient le joueur actif, tel que `viewerId` a le droit de le savoir. */
export function heldSummary(view: GameView): { text: string; revealed: boolean } | null {
  if (view.heldFrom === null || view.currentPlayerId === null) return null;
  if (view.currentPlayerId === view.you.id) return null;

  const name = view.players.find((p) => p.id === view.currentPlayerId)?.name ?? 'Quelqu’un';
  return view.heldFrom === 'discard'
    ? { text: `${name} a pris la défausse`, revealed: true }
    : { text: `${name} a pioché`, revealed: false };
}
