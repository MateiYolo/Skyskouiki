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

/** Le dernier coup de chaque joueur, par identifiant. Formulation courte, à la
    troisième personne : « prend le 4 ». */
export type LastMoves = Readonly<Record<string, string>>;

/** Le nom d'une carte déplacée par un Vol ou une Valse, face cachée comprise. */
function movedName(card: ValueCard | null): string {
  return card === null ? 'une carte cachée' : cardName(card);
}

/**
 * Les deux cartes d'une Valse, mises en mots.
 *
 * Deux dos donnaient « une carte cachée et une carte cachée » : la phrase
 * bégayait là où, à table, on dit simplement « deux cartes cachées ».
 */
export function swappedPair(first: ValueCard | null, second: ValueCard | null): string {
  if (first === null && second === null) return 'deux cartes cachées';
  return `${movedName(first)} et ${movedName(second)}`;
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
      return `vole ${movedName(event.taken)}, laisse ${movedName(event.given)}`;
    case 'stealDeclined':
      return 'renonce au Vol';
    case 'swapDrawn':
      return 'pioche une Valse';
    case 'swapped':
      // Deux cases de la même grille : personne d'autre n'a bougé, mais ce qui
      // se lisait à un endroit se lit maintenant à l'autre.
      return `intervertit ${swappedPair(event.first, event.second)}`;
    case 'swapDeclined':
      return 'renonce à la Valse';
    default:
      return null;
  }
}

/**
 * Le dernier coup de chacun, tel que `lastEvents` le raconte.
 *
 * Un seul coup suffisait à deux joueurs : un lot d'événements ne contenait
 * jamais que le coup d'en face. Mais `lastEvents` n'est pas toujours *un* coup —
 * `eventsSince` rattrape volontairement plusieurs versions d'un seul rendu
 * quand un client a pris du retard, et le sondage de secours, douze fois plus
 * lent que le temps réel, tombe droit dans ce cas. À quatre joueurs, deux
 * adversaires qui jouent dans le même rafraîchissement sont fréquents — et
 * n'en montrer qu'un laissait l'autre changer sa grille sans un mot.
 *
 * Le plus récent gagne pour un joueur donné : sa phrase vaut jusqu'au coup
 * suivant, ce qui est exactement la durée pendant laquelle elle sert.
 */
export function lastMoves(view: GameView): LastMoves {
  const moves: Record<string, string> = {};
  for (const event of view.lastEvents) {
    const text = describe(event);
    if (text !== null && 'playerId' in event) moves[event.playerId] = text;
  }
  return moves;
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
  if (view.turnStep === 'swapping') {
    return { text: `${name} a pioché une Valse et réarrange sa grille`, revealed: true };
  }
  if (view.heldFrom === null) return null;

  const card = view.heldCard;
  const where = view.heldFrom === 'discard' ? 'a pris la défausse' : 'a pioché';
  return {
    text: card === null ? `${name} ${where}` : `${name} ${where} : ${cardName(card)}`,
    revealed: card !== null,
  };
}
