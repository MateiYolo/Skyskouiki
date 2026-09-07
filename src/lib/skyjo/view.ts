import { countFaceDown, countFaceUp } from './rules';
import type { Cell, GameEvent, GameState, Phase, RoundScore, TurnStep } from './types';

/** Une case telle qu'un client a le droit de la voir : la valeur cachée n'y figure pas. */
export type ViewCell = null | { faceUp: true; value: number } | { faceUp: false };

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
  | 'startGame'
  | 'nextRound'
  | 'playAgain';

export interface GameView {
  id: string;
  code: string;
  version: number;
  phase: Phase;
  round: number;
  targetScore: number;
  hostId: string;
  players: ViewPlayer[];
  currentPlayerId: string | null;
  turnStep: TurnStep;
  drawPileCount: number;
  discardTop: number | null;
  discardCount: number;
  /**
   * Carte en main. Visible de tous si elle vient de la défausse — sur une vraie
   * table, tout le monde a vu quelle carte le joueur y a prise. Secrète si elle
   * vient de la pioche, jusqu'à ce qu'elle soit posée ou jetée.
   */
  heldCard: number | null;
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
  return cell.faceUp ? { faceUp: true, value: cell.value } : { faceUp: false };
}

function visibleSum(grid: readonly Cell[]): number {
  return grid.reduce<number>((n, c) => (c && c.faceUp ? n + c.value : n), 0);
}

/**
 * Projette l'état serveur vers ce que `viewerId` a le droit de connaître.
 * C'est la seule forme qui doit transiter jusqu'au navigateur.
 */
export function toView(state: GameState, viewerId: string): GameView {
  const current = state.players[state.currentPlayerIndex] ?? null;
  const isCurrent = !!current && current.id === viewerId;

  return {
    id: state.id,
    code: state.code,
    version: state.version,
    phase: state.phase,
    round: state.round,
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
    heldCard: isCurrent || state.heldFrom === 'discard' ? state.heldCard : null,
    heldFrom: state.heldFrom,
    roundCloserId: state.roundCloserId,
    finalTurnsLeft: state.finalTurnsLeft,
    lastEvents: state.lastEvents,
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

export function legalActionsFor(state: GameState, viewerId: string): LegalAction[] {
  const me = state.players.find((p) => p.id === viewerId);
  if (!me) return [];
  const current = state.players[state.currentPlayerIndex] ?? null;
  const isCurrent = !!current && current.id === viewerId;

  switch (state.phase) {
    case 'lobby':
      return state.hostId === viewerId && state.players.length >= 2 ? ['startGame'] : [];
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
      return ['flipCard'];
    case 'roundOver':
      return ['nextRound'];
    case 'gameOver':
      return ['playAgain'];
  }
}
