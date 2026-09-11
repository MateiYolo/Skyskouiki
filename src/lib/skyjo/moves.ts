import { cardName } from './rules';
import type { GameEvent, ValueCard } from './types';
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

/** Le nom d'une carte échangée par un Vol, face cachée comprise. */
function stolenName(card: ValueCard | null): string {
  return card === null ? 'une carte cachée' : cardName(card);
}

function describe(event: GameEvent): string | null {
  switch (event.type) {
    case 'drew':
      return event.from === 'discard' ? 'prend la défausse' : 'pioche';
    case 'placed':
      return `pose ${cardName(event.placed)}, jette ${cardName(event.discarded)}`;
    case 'discarded':
      return `jette ${cardName(event.value)}`;
    case 'flipped':
      return `retourne ${cardName(event.value)}`;
    case 'stealDrawn':
      return 'pioche un Vol';
    case 'stole':
      // Une carte jamais retournée n'a pas de nom : elle a traversé la table
      // sans que personne — le voleur compris — ne sache ce qu'elle valait.
      return `vole ${stolenName(event.taken)}, laisse ${stolenName(event.given)}`;
    case 'stealDeclined':
      return 'renonce au Vol';
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

/**
 * Ce que tient le joueur actif, en clair, pour ceux qui le regardent jouer.
 *
 * La valeur est annoncée dans les deux cas : la carte en main est publique,
 * qu'elle vienne de la pioche ou de la défausse (cf. `GameView.heldCard`). Ce
 * qui reste à deviner, c'est ce qu'il va en faire.
 */
export function heldSummary(view: GameView): { text: string; revealed: boolean } | null {
  if (view.currentPlayerId === null || view.currentPlayerId === view.you.id) return null;
  const name = view.players.find((p) => p.id === view.currentPlayerId)?.name ?? 'Quelqu’un';

  // Un Vol ne se tient pas en main au sens du moteur, mais pour celui qui
  // regarde c'est exactement la même chose : quelqu'un a pioché quelque chose,
  // et tout le tour dépend de ce qu'il va en faire.
  if (view.turnStep === 'stealing') {
    return { text: `${name} a pioché un Vol et choisit son échange`, revealed: true };
  }
  if (view.heldFrom === null) return null;

  const card = view.heldCard;
  const where = view.heldFrom === 'discard' ? 'a pris la défausse' : 'a pioché';
  return {
    text: card === null ? `${name} ${where}` : `${name} ${where} : ${cardName(card)}`,
    revealed: card !== null,
  };
}
