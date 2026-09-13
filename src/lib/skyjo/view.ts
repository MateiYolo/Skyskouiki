import { countFaceDown, countFaceUp } from './rules';
import type {
  Cell,
  GameEvent,
  GameState,
  Phase,
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
  | 'swap'
  | 'declineSwap'
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

/**
 * La vue sans les deux champs qui nomment son lecteur.
 *
 * C'est la forme qui se diffuse : une seule projection pour toute la table,
 * que chaque téléphone s'adresse ensuite à lui-même (cf. `viewFor`).
 */
export type SharedView = Omit<GameView, 'you' | 'legalActions'>;

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
  return viewFor(toSharedView(state, since), viewerId);
}

/**
 * La partie de la vue qui est la même pour tout le monde — c'est-à-dire tout,
 * sauf les deux champs qui nomment le lecteur.
 *
 * Ce n'est pas une commodité : c'est ce qui permet de *diffuser* un coup au
 * lieu de le faire redemander. Le serveur publie cette projection telle quelle
 * sur le canal de la partie, et chaque téléphone se l'adresse à lui-même avec
 * `viewFor`. Sans ça, apprendre qu'un coup a eu lieu coûtait un aller-retour
 * complet de plus que le coup lui-même.
 *
 * Rien n'y est secret qui ne le soit déjà : `toView` était déjà identique pour
 * tous les joueurs, et sa sortie est déjà ce que n'importe qui connaissant le
 * code de la partie obtient en la demandant.
 */
export function toSharedView(state: GameState, since?: number): SharedView {
  const current = state.players[state.currentPlayerIndex] ?? null;

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
  };
}

/**
 * Adresse une vue partagée à un joueur : qui il est, et ce qu'il peut jouer.
 *
 * Les deux se déduisent de la vue elle-même — c'est tout l'intérêt. Le
 * navigateur qui reçoit une diffusion n'a donc rien à redemander au serveur
 * pour savoir sur quoi taper.
 */
export function viewFor(shared: SharedView, viewerId: string): GameView {
  return {
    ...shared,
    you: {
      id: viewerId,
      isHost: shared.hostId === viewerId,
      isCurrent: shared.currentPlayerId === viewerId,
    },
    legalActions: legalActionsFrom(shared, viewerId),
  };
}

/**
 * Vrai si un échange est jouable : une carte chez moi, une chez un adversaire —
 * face visible ou non, l'échange ne regarde pas la face.
 *
 * Le cas contraire n'est pas qu'une précaution : une grille entièrement vidée
 * par ses éliminations n'a plus rien à échanger, et on se retrouve alors avec
 * un Vol en main et personne à voler.
 */
function canSteal(view: SharedView, me: ViewPlayer): boolean {
  const holdsCard = (p: ViewPlayer) => p.grid.some((cell) => cell !== null);
  if (!holdsCard(me)) return false;
  return view.players.some((p) => p.id !== me.id && holdsCard(p));
}

/**
 * Vrai si une Valse est jouable : il faut deux cartes à intervertir.
 *
 * Une grille réduite à une seule carte par ses éliminations n'a rien à
 * réarranger — et on se retrouverait avec une Valse en main et une seule case
 * à désigner.
 */
function canSwap(me: ViewPlayer): boolean {
  return me.grid.filter((cell) => cell !== null).length >= 2;
}

/**
 * Qui joue après celui qui joue.
 *
 * À deux, la question ne se pose pas. À quatre, elle décide du coup : savoir
 * s'il reste un tour ou trois avant le sien, c'est savoir si la carte de la
 * défausse qu'on convoite sera encore là. L'ordre de `players` **est** l'ordre
 * de jeu — il n'y a rien à calculer, il n'y avait rien d'affiché.
 *
 * Rend `null` pendant le dernier tour de celui qui clôt la manche : quand il
 * ne reste qu'un coup à jouer, personne ne joue « ensuite ».
 */
export function nextPlayerId(view: SharedView): string | null {
  if (view.phase !== 'playing' || view.currentPlayerId === null) return null;
  if (view.finalTurnsLeft !== null && view.finalTurnsLeft <= 1) return null;
  const seat = view.players.findIndex((p) => p.id === view.currentPlayerId);
  if (seat === -1) return null;
  return view.players[(seat + 1) % view.players.length].id;
}

/**
 * Les coups jouables, déduits de la vue seule.
 *
 * Écrite sur la vue et non sur l'état, et c'est tout l'enjeu : le navigateur
 * peut l'appeler. Une vue diffusée devient donc immédiatement jouable, sans
 * repasser par le serveur pour demander sur quoi taper.
 *
 * Les comptes dont elle a besoin sont déjà dans la projection — `faceUpCount`,
 * `faceDownCount`, `drawPileCount`, `discardCount` — et les cases retirées y
 * sont toujours `null`. Rien de ce qui décide d'un coup légal n'était secret.
 */
export function legalActionsFrom(view: SharedView, viewerId: string): LegalAction[] {
  const me = view.players.find((p) => p.id === viewerId);
  if (!me) return [];
  const isCurrent = view.currentPlayerId === viewerId;

  switch (view.phase) {
    case 'lobby': {
      if (view.hostId !== viewerId) return [];
      // Le mode se change tant que rien n'est distribué, même seul dans le salon.
      return view.players.length >= 2 ? ['setVariant', 'startGame'] : ['setVariant'];
    }
    case 'initialFlip':
      return me.faceUpCount < 2 ? ['flipInitial'] : [];
    case 'playing':
      if (!isCurrent) return [];
      if (view.turnStep === 'choose') {
        const canDraw = view.drawPileCount > 0 || view.discardCount > 1;
        return canDraw ? ['drawFromPile', 'takeDiscard'] : ['takeDiscard'];
      }
      if (view.turnStep === 'holding') {
        return view.heldFrom === 'draw' && me.faceDownCount > 0
          ? ['placeCard', 'discardHeld']
          : ['placeCard'];
      }
      // Renoncer reste toujours possible : c'est ce qui garantit qu'un Vol ne
      // peut pas bloquer un tour, même sans cible.
      if (view.turnStep === 'stealing') {
        return canSteal(view, me) ? ['steal', 'declineSteal'] : ['declineSteal'];
      }
      if (view.turnStep === 'swapping') {
        return canSwap(me) ? ['swap', 'declineSwap'] : ['declineSwap'];
      }
      return ['flipCard'];
    case 'roundOver':
      return ['nextRound'];
    case 'gameOver':
      return ['playAgain'];
  }
}

/**
 * Les coups jouables à partir de l'état serveur.
 *
 * Passe par la projection, pour qu'il n'existe qu'une seule définition de ce
 * qui est légal — celle que le navigateur applique aussi. Deux implémentations
 * qui s'accordent aujourd'hui finiraient par diverger, et la divergence se
 * paierait en coups refusés après coup.
 */
export function legalActionsFor(state: GameState, viewerId: string): LegalAction[] {
  return legalActionsFrom(toSharedView(state), viewerId);
}
