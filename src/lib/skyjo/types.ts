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

/**
 * Une case de la grille. `null` = carte retirée (colonne éliminée).
 *
 * Le joker est une case comme une autre, avec `value: 0` — sa valeur au
 * comptage — et un drapeau. Ce n'est pas un contournement : c'est ce qui permet
 * à `gridSum`, aux sommes visibles et à tout le comptage de le traiter sans une
 * ligne de code en plus. Seules les éliminations regardent le drapeau, parce
 * que ce sont elles que le joker change.
 */
export type Cell = { value: number; faceUp: boolean; joker?: true } | null;

/** Une colonne ou une ligne dont toutes les cartes encore présentes sont identiques. */
export type GroupKind = 'column' | 'row';

/**
 * Le mode de jeu, choisi dans le salon.
 *
 * `spicy` n'ajoute rien au tour de jeu : il change la composition du paquet
 * (deux -5) et y glisse quatre cartes Vol. Tout le reste — colonnes, lignes,
 * comptage, pénalité de fermeture — est identique.
 */
export type Variant = 'classic' | 'spicy';

/**
 * La carte Vol.
 *
 * Elle ne porte pas de valeur et ne peut donc pas vivre dans une grille : elle
 * n'existe que dans la pioche, et se résout à l'instant où on la pioche. C'est
 * ce qui permet de l'ajouter sans toucher au comptage, aux éliminations ni à la
 * projection des cases — une case de grille reste un nombre.
 */
export const STEAL_CARD = 'steal';
export type StealCard = typeof STEAL_CARD;

/**
 * Le joker (mode spicy, un seul exemplaire).
 *
 * Il vaut 0 au comptage et complète n'importe quel groupe : une colonne
 * `7 / joker / 7` saute. Contrairement au Vol, il vit dans une grille et se
 * pioche comme les autres — d'où son passage dans toutes les piles, et d'où le
 * type `ValueCard`.
 */
export const JOKER_CARD = 'joker';
export type JokerCard = typeof JOKER_CARD;

/** La valeur du joker au comptage. Un joker qui reste en grille ne coûte rien. */
export const JOKER_VALUE = 0;

/**
 * Une carte qui a une valeur au comptage : un nombre, ou le joker.
 *
 * C'est ce qui circule dans la défausse et se tient en main. Le Vol, lui, n'en
 * fait pas partie : il n'a rien à compter et ne peut donc apparaître nulle part
 * ailleurs que dans la pioche.
 */
export type ValueCard = number | JokerCard;

/** Ce qu'une pioche peut contenir : les cartes à valeur, plus les Vol (spicy). */
export type PileCard = ValueCard | StealCard;

export function isStealCard(card: PileCard): card is StealCard {
  return card === STEAL_CARD;
}

export function isJokerCard(card: PileCard): card is JokerCard {
  return card === JOKER_CARD;
}

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
  | 'mustFlip'
  /** Mode spicy : le joueur a pioché un Vol et doit désigner l'échange (ou y renoncer). */
  | 'stealing';

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
  | { type: 'initialFlip'; playerId: string; index: number; value: ValueCard }
  | { type: 'turnStarted'; playerId: string }
  | { type: 'drew'; playerId: string; from: 'draw' | 'discard' }
  | { type: 'placed'; playerId: string; index: number; placed: ValueCard; discarded: ValueCard }
  | { type: 'discarded'; playerId: string; value: ValueCard }
  | { type: 'flipped'; playerId: string; index: number; value: ValueCard }
  | {
      type: 'groupCleared';
      playerId: string;
      kind: GroupKind;
      index: number;
      /** La valeur sur laquelle le groupe s'est accordé — jamais celle du joker. */
      value: number;
      /** Les cases réellement retirées : sur une ligne trouée, elles ne sont pas quatre. */
      cells: number[];
      /**
       * Celles de ces cases qui portaient le joker.
       *
       * L'animation d'élimination remontre les cartes qui partent pour dire
       * *lesquelles* et *pourquoi* : afficher la valeur du groupe sur le joker
       * lui ferait raconter que la colonne était faite de trois 7, alors que
       * c'est précisément le joker qui l'a fermée.
       */
      jokers: number[];
    }
  | { type: 'pileReshuffled' }
  /** Mode spicy : un Vol vient d'être pioché ; son porteur doit désigner l'échange. */
  | { type: 'stealDrawn'; playerId: string }
  | {
      type: 'stole';
      playerId: string;
      /** Case du voleur : elle contient désormais `taken`. */
      index: number;
      /** La carte prise à la victime. */
      taken: ValueCard;
      targetPlayerId: string;
      /** Case de la victime : elle contient désormais `given`. */
      targetIndex: number;
      /** La carte laissée en échange. */
      given: ValueCard;
    }
  | { type: 'stealDeclined'; playerId: string }
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
  /** Mode de jeu. Absent des parties créées avant le mode spicy : lire `?? 'classic'`. */
  variant: Variant;

  /** SECRET : ordre de la pioche, dernière carte en fin de tableau (= sommet). */
  drawPile: PileCard[];
  /** Défausse, dernière carte en fin de tableau (= sommet, visible de tous). */
  discardPile: ValueCard[];

  currentPlayerIndex: number;
  turnStep: TurnStep;
  /** SECRET pour les autres : carte en main du joueur actif. */
  heldCard: ValueCard | null;
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
  | { type: 'setVariant'; playerId: string; variant: Variant }
  | { type: 'startGame'; playerId: string }
  | { type: 'flipInitial'; playerId: string; index: number }
  | { type: 'drawFromPile'; playerId: string }
  | { type: 'takeDiscard'; playerId: string }
  | { type: 'placeCard'; playerId: string; index: number }
  | { type: 'discardHeld'; playerId: string }
  | { type: 'flipCard'; playerId: string; index: number }
  /** Mode spicy : échange une de mes cartes visibles contre celle d'un adversaire. */
  | {
      type: 'steal';
      playerId: string;
      index: number;
      targetPlayerId: string;
      targetIndex: number;
    }
  | { type: 'declineSteal'; playerId: string }
  | { type: 'nextRound'; playerId: string }
  | { type: 'playAgain'; playerId: string };

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
