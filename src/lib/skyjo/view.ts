import { countFaceDown, countFaceUp } from './rules';
import type {
  Cell,
  GameEvent,
  GameState,
  Phase,
  Player,
  RoundScore,
  TurnStep,
  ValueCard,
  Variant,
} from './types';

/**
 * Une case telle qu'un client a le droit de la voir : la valeur cachée n'y
 * figure pas. Le joker s'y annonce comme dans l'état — un 0 et un drapeau.
 */
export type ViewCell =
  | null
  | { faceUp: true; value: number; joker?: true }
  | { faceUp: false };

export interface ViewPlayer {
  id: string;
  name: string;
  emoji: string;
  connected: boolean;
  grid: ViewCell[];
  totalScore: number;
  roundScores: number[];
  faceDownCount: number;
  faceUpCount: number;
  /** Somme des cartes déjà visibles : le score « au pire » affichable en direct. */
  visibleSum: number;
}

export type LegalAction =
  | 'flipInitial'
  | 'drawFromPile'
  | 'takeDiscard'
  | 'placeCard'
  | 'discardHeld'
  | 'flipCard'
  | 'steal'
  | 'declineSteal'
  | 'startGame'
  | 'setVariant'
  | 'nextRound'
  | 'playAgain';

export interface GameView {
  id: string;
  code: string;
  version: number;
  phase: Phase;
  round: number;
  variant: Variant;
  targetScore: number;
  hostId: string;
  players: ViewPlayer[];
  currentPlayerId: string | null;
  turnStep: TurnStep;
  drawPileCount: number;
  discardTop: ValueCard | null;
  discardCount: number;
  /**
   * Carte en main, visible de tous — y compris quand elle sort de la pioche.
   *
   * C'est un écart assumé avec le jeu de société, où l'on regarde sa pioche à
   * l'abri. Sur deux téléphones, la carte en main est le pivot du tour : c'est
   * elle qui explique pourquoi l'adversaire pose ici plutôt que là, et une
   * carte grise au milieu de la table ne raconte rien à celui qui attend. Elle
   * ne donne d'ailleurs aucun avantage : la décision appartient à celui qui la
   * tient, l'autre ne fait que comprendre le coup pendant qu'il se joue.
   */
  heldCard: ValueCard | null;
  heldFrom: 'draw' | 'discard' | null;
  roundCloserId: string | null;
  finalTurnsLeft: number | null;
  lastEvents: GameEvent[];
  lastRoundScores: RoundScore[] | null;
  winnerId: string | null;
  you: { id: string; isHost: boolean; isCurrent: boolean };
  legalActions: LegalAction[];
}

function viewCell(cell: Cell): ViewCell {
  if (cell === null) return null;
  if (!cell.faceUp) return { faceUp: false };
  return cell.joker ? { faceUp: true, value: cell.value, joker: true } : { faceUp: true, value: cell.value };
}

function visibleSum(grid: readonly Cell[]): number {
  return grid.reduce<number>((n, c) => (c && c.faceUp ? n + c.value : n), 0);
}

/**
 * Les événements qu'un client n'a pas encore vus.
 *
 * Sans `since`, on s'en tient au dernier coup — c'est ce dont a besoin celui
 * qui vient de jouer. Avec, on lui rend tout ce qui s'est produit depuis la
 * version qu'il connaît : deux coups tombés dans le même rafraîchissement
 * doivent tous les deux s'animer chez l'autre joueur, sinon son adversaire
 * élimine une colonne dans son dos.
 */
function eventsSince(state: GameState, since: number | undefined): GameEvent[] {
  if (since === undefined || since >= state.version) return state.lastEvents;
  const log = state.eventLog ?? [];
  const missed = log.filter((batch) => batch.version > since).flatMap((batch) => batch.events);
  // Journal trop court (ou partie d'avant son existence) : le dernier coup
  // reste toujours mieux que rien.
  return missed.length ? missed : state.lastEvents;
}

/**
 * Projette l'état serveur vers ce que `viewerId` a le droit de connaître.
 * C'est la seule forme qui doit transiter jusqu'au navigateur.
 *
 * `since` est la dernière version que ce client a vue : elle décide de ce qu'on
 * lui rejoue en événements, jamais de ce qu'il a le droit de voir.
 */
export function toView(state: GameState, viewerId: string, since?: number): GameView {
  const current = state.players[state.currentPlayerIndex] ?? null;
  const isCurrent = !!current && current.id === viewerId;

  return {
    id: state.id,
    code: state.code,
    version: state.version,
    phase: state.phase,
    round: state.round,
    variant: state.variant ?? 'classic',
    targetScore: state.targetScore,
    hostId: state.hostId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      connected: p.connected,
      grid: p.grid.map(viewCell),
      totalScore: p.totalScore,
      roundScores: p.roundScores,
      faceDownCount: countFaceDown(p.grid),
      faceUpCount: countFaceUp(p.grid),
      visibleSum: visibleSum(p.grid),
    })),
    currentPlayerId: current?.id ?? null,
    turnStep: state.turnStep,
    drawPileCount: state.drawPile.length,
    discardTop: state.discardPile.at(-1) ?? null,
    discardCount: state.discardPile.length,
    heldCard: state.heldCard,
    heldFrom: state.heldFrom,
    roundCloserId: state.roundCloserId,
    finalTurnsLeft: state.finalTurnsLeft,
    lastEvents: eventsSince(state, since),
    lastRoundScores: state.lastRoundScores,
    winnerId: state.winnerId,
    you: {
      id: viewerId,
      isHost: state.hostId === viewerId,
      isCurrent,
    },
    legalActions: legalActionsFor(state, viewerId),
  };
}

/**
 * Vrai si un échange est jouable : une carte visible chez moi, une chez un
 * adversaire.
 *
 * Le cas contraire n'est pas qu'une précaution : deux cartes retournées en
 * début de manche peuvent toutes les deux partir avec une colonne éliminée, et
 * on se retrouve alors avec un Vol en main et personne à voler.
 */
function canSteal(state: GameState, me: Player): boolean {
  if (countFaceUp(me.grid) === 0) return false;
  return state.players.some((p) => p.id !== me.id && countFaceUp(p.grid) > 0);
}

export function legalActionsFor(state: GameState, viewerId: string): LegalAction[] {
  const me = state.players.find((p) => p.id === viewerId);
  if (!me) return [];
  const current = state.players[state.currentPlayerIndex] ?? null;
  const isCurrent = !!current && current.id === viewerId;

  switch (state.phase) {
    case 'lobby': {
      if (state.hostId !== viewerId) return [];
      // Le mode se change tant que rien n'est distribué, même seul dans le salon.
      return state.players.length >= 2 ? ['setVariant', 'startGame'] : ['setVariant'];
    }
    case 'initialFlip':
      return countFaceUp(me.grid) < 2 ? ['flipInitial'] : [];
    case 'playing':
      if (!isCurrent) return [];
      if (state.turnStep === 'choose') {
        const canDraw = state.drawPile.length > 0 || state.discardPile.length > 1;
        return canDraw ? ['drawFromPile', 'takeDiscard'] : ['takeDiscard'];
      }
      if (state.turnStep === 'holding') {
        return state.heldFrom === 'draw' && countFaceDown(me.grid) > 0
          ? ['placeCard', 'discardHeld']
          : ['placeCard'];
      }
      // Renoncer reste toujours possible : c'est ce qui garantit qu'un Vol ne
      // peut pas bloquer un tour, même sans cible.
      if (state.turnStep === 'stealing') {
        return canSteal(state, me) ? ['steal', 'declineSteal'] : ['declineSteal'];
      }
      return ['flipCard'];
    case 'roundOver':
      return ['nextRound'];
    case 'gameOver':
      return ['playAgain'];
  }
}
