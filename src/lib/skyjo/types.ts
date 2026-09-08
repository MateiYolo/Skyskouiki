/**
 * Types du moteur Skyjo.
 *
 * L'état complet (`GameState`) contient de l'information cachée : l'ordre de la
 * pioche et la valeur des cartes face cachée. Il ne quitte jamais le serveur.
 * Les clients reçoivent une projection expurgée (`PlayerView`, cf. view.ts).
 */

export const ROWS = 3;
export const COLS = 4;
export const GRID_SIZE = ROWS * COLS; // 12

/** Une case de la grille. `null` = carte retirée (colonne éliminée). */
export type Cell = { value: number; faceUp: boolean } | null;

/** Une colonne ou une ligne dont toutes les cartes encore présentes sont identiques. */
export type GroupKind = 'column' | 'row';

export type Phase =
  | 'lobby'
  | 'initialFlip'
  | 'playing'
  | 'roundOver'
  | 'gameOver';

/** Sous-état du tour courant. */
export type TurnStep =
  /** Le joueur doit choisir : piocher, ou prendre la défausse. */
  | 'choose'
  /** Le joueur tient une carte et doit la placer (ou la défausser si elle vient de la pioche). */
  | 'holding'
  /** Le joueur a défaussé la carte piochée : il doit retourner une carte face cachée. */
  | 'mustFlip';

export interface Player {
  id: string;
  name: string;
  emoji: string;
  grid: Cell[];
  /** Score cumulé sur toute la partie. */
  totalScore: number;
  /** Score de chaque manche, dans l'ordre. */
  roundScores: number[];
  connected: boolean;
}

export type GameEvent =
  | { type: 'roundStarted'; round: number }
  | { type: 'initialFlip'; playerId: string; index: number; value: number }
  | { type: 'turnStarted'; playerId: string }
  | { type: 'drew'; playerId: string; from: 'draw' | 'discard' }
  | { type: 'placed'; playerId: string; index: number; placed: number; discarded: number }
  | { type: 'discarded'; playerId: string; value: number }
  | { type: 'flipped'; playerId: string; index: number; value: number }
  | {
      type: 'groupCleared';
      playerId: string;
      kind: GroupKind;
      index: number;
      value: number;
      /** Les cases réellement retirées : sur une ligne trouée, elles ne sont pas quatre. */
      cells: number[];
    }
  | { type: 'pileReshuffled' }
  | { type: 'lastTurnTriggered'; playerId: string }
  | { type: 'roundOver'; scores: RoundScore[] }
  | { type: 'gameOver'; winnerId: string };

/** Un lot d'événements et la version de la partie qui l'a produit. */
export interface EventBatch {
  version: number;
  events: GameEvent[];
}

export interface RoundScore {
  playerId: string;
  /** Somme des cartes restantes, avant pénalité. */
  raw: number;
  /** Score finalement encaissé (= raw, ou raw × 2 en cas de pénalité). */
  final: number;
  /** Vrai si le joueur a fermé la manche sans avoir le total le plus bas. */
  doubled: boolean;
  /** Vrai si c'est ce joueur qui a fermé la manche. */
  closedRound: boolean;
}

export interface GameState {
  id: string;
  code: string;
  /** Incrémenté à chaque action appliquée : sert de verrou optimiste en base. */
  version: number;
  phase: Phase;
  players: Player[];
  hostId: string;

  /** SECRET : ordre de la pioche, dernière carte en fin de tableau (= sommet). */
  drawPile: number[];
  /** Défausse, dernière carte en fin de tableau (= sommet, visible de tous). */
  discardPile: number[];

  currentPlayerIndex: number;
  turnStep: TurnStep;
  /** SECRET pour les autres : carte en main du joueur actif. */
  heldCard: number | null;
  heldFrom: 'draw' | 'discard' | null;

  /** Joueur ayant révélé toutes ses cartes en premier (déclencheur du dernier tour). */
  roundCloserId: string | null;
  /** Nombre de tours restants avant la fin de manche, une fois le dernier tour déclenché. */
  finalTurnsLeft: number | null;
  /** La pioche s'est épuisée sans pouvoir être reconstituée : la manche s'arrête après ce tour. */
  pileExhausted: boolean;

  round: number;
  targetScore: number;
  seed: number;

  /** Événements produits par la dernière action : consommés par l'UI pour les animations. */
  lastEvents: GameEvent[];
  /**
   * Les derniers lots d'événements, chacun avec la version qui l'a produit.
   *
   * Un client ne reçoit pas forcément toutes les versions : deux coups joués
   * coup sur coup peuvent tomber dans un seul rafraîchissement, et le second
   * effacerait le premier. Sans mémoire, la colonne que l'adversaire vient
   * d'éliminer n'aurait tout simplement jamais été annoncée à l'autre écran.
   * Le journal permet de demander « tout ce qui s'est passé depuis la version
   * que je connais » — borné, parce qu'un client absent depuis longtemps n'a
   * plus rien à rejouer.
   */
  eventLog: EventBatch[];
  lastRoundScores: RoundScore[] | null;
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type Action =
  | { type: 'join'; playerId: string; name: string; emoji: string }
  | { type: 'leave'; playerId: string }
  | { type: 'startGame'; playerId: string }
  | { type: 'flipInitial'; playerId: string; index: number }
  | { type: 'drawFromPile'; playerId: string }
  | { type: 'takeDiscard'; playerId: string }
  | { type: 'placeCard'; playerId: string; index: number }
  | { type: 'discardHeld'; playerId: string }
  | { type: 'flipCard'; playerId: string; index: number }
  | { type: 'nextRound'; playerId: string }
  | { type: 'playAgain'; playerId: string };

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
