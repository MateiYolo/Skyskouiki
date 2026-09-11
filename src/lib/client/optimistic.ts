import { JOKER_CARD, cellToCard, type GameView, type ViewCell, type ViewPlayer } from '@/lib/skyjo';
import type { ClientAction } from './actions';

/**
 * Ce que le client peut afficher sans attendre le serveur.
 *
 * Un aller-retour réseau — même rapide — se sent : entre le doigt et la carte
 * qui bouge, il y a un blanc, et le joueur retape. Or la plupart des coups sont
 * entièrement déterminés par ce que le navigateur a déjà sous la main : jeter
 * la carte qu'on tient, la poser sur une case, prendre le sommet de la défausse
 * — rien là-dedans n'est un secret du serveur. On applique donc le coup
 * localement, tout de suite, et la réponse ne fait que confirmer.
 *
 * Deux règles pour que ça reste honnête :
 *
 *   - **on n'invente jamais une valeur cachée.** Retourner une carte ou piocher
 *     ne révèle rien ici : le dos se retourne, la valeur arrive du serveur ;
 *   - **on ferme ce qui n'a plus lieu d'être joué** le temps de la réponse,
 *     pour qu'un second tap ne parte pas sur un état qui n'existe déjà plus.
 *     Ce qui reste ouvert l'est parce que la file d'envoi de `useGame`
 *     sérialise les coups : le joueur peut enchaîner, le serveur les reçoit
 *     l'un après l'autre.
 *
 * En cas de refus, `useGame` recharge : la vue optimiste n'est jamais qu'un
 * pari de quelques dizaines de millisecondes.
 */

function faceUp(cell: ViewCell): cell is { faceUp: true; value: number; joker?: true } {
  return cell !== null && cell.faceUp;
}

/** La case que devient une case qui reçoit cette carte, joker compris. */
function placedCell(card: NonNullable<GameView['heldCard']>): ViewCell {
  return card === JOKER_CARD
    ? { faceUp: true, value: 0, joker: true }
    : { faceUp: true, value: card };
}

/** Recompte ce qui dépend de la grille : les tuiles de score ne doivent pas décrocher. */
function withGrid(player: ViewPlayer, grid: ViewCell[]): ViewPlayer {
  return {
    ...player,
    grid,
    faceUpCount: grid.filter(faceUp).length,
    faceDownCount: grid.filter((c) => c !== null && !c.faceUp).length,
    visibleSum: grid.reduce<number>((n, c) => (faceUp(c) ? n + c.value : n), 0),
  };
}

/**
 * La vue telle qu'elle sera, appliquée sur-le-champ — ou `null` quand le coup
 * dépend d'une information que seul le serveur possède.
 */
export function optimisticView(
  view: GameView,
  action: ClientAction,
  playerId: string,
): GameView | null {
  switch (action.type) {
    // Un interrupteur qui attend un aller-retour pour changer d'état se lit
    // comme un tap raté, et on le retape. Rien n'est deviné ici : c'est l'hôte
    // qui décide, et le serveur ne fera que confirmer.
    case 'setVariant':
      return { ...view, variant: action.variant };

    // La valeur retournée est un secret du serveur. On ne la devine pas : la
    // carte part en rotation (cf. `revealingIndex`) et la valeur suivra.
    //
    // En début de manche il y en a deux à retourner : on garde l'action ouverte
    // pour que le second tap parte sans attendre le premier — la file d'envoi
    // de `useGame` s'occupe de ne pas les faire se marcher dessus. Le
    // retournement obligatoire de fin de tour, lui, est unique : on ferme.
    case 'flipInitial':
      return view;
    case 'flipCard':
      return { ...view, legalActions: [] };

    // Pareil pour la pioche : on sait qu'une carte arrive en main, pas laquelle.
    // `heldCard: null` l'affiche face cachée, elle se retournera à la réponse.
    case 'drawFromPile':
      return { ...view, turnStep: 'holding', heldFrom: 'draw', heldCard: null, legalActions: [] };

    // Le sommet de la défausse, lui, est public : on peut le prendre en main
    // immédiatement. Ce qu'il y avait dessous reste inconnu, donc la pile
    // s'affiche vide le temps que le serveur dise ce qui remonte.
    case 'takeDiscard':
      if (view.discardTop === null) return null;
      return {
        ...view,
        turnStep: 'holding',
        heldFrom: 'discard',
        heldCard: view.discardTop,
        discardTop: null,
        legalActions: [],
      };

    // Entièrement connu : la carte qu'on tient part sur la défausse, et le
    // joueur enchaîne aussitôt sur le retournement obligatoire.
    case 'discardHeld':
      if (view.heldCard === null) return null;
      return {
        ...view,
        turnStep: 'mustFlip',
        heldFrom: null,
        heldCard: null,
        discardTop: view.heldCard,
        legalActions: ['flipCard'],
      };

    case 'placeCard': {
      const me = view.players.find((p) => p.id === playerId);
      const cell = me?.grid[action.index];
      if (!me || cell === undefined || cell === null || view.heldCard === null) return null;

      const grid = me.grid.map((c, i) => (i === action.index ? placedCell(view.heldCard!) : c));

      return {
        ...view,
        players: view.players.map((p) => (p.id === me.id ? withGrid(p, grid) : p)),
        turnStep: 'choose',
        heldFrom: null,
        heldCard: null,
        // Une case cachée ne dit pas ce qu'elle jette : on laisse le serveur
        // révéler le sommet de la défausse plutôt que d'afficher un mensonge.
        discardTop: faceUp(cell) ? cellToCard(cell) : view.discardTop,
        legalActions: [],
      };
    }

    default:
      return null;
  }
}

/**
 * La case dont on attend la valeur : elle se retourne dès le doigt posé et
 * s'arrête sur une face neutre jusqu'à ce que le serveur dise ce qu'il y a
 * dessus.
 */
export function revealingIndex(action: ClientAction): number | null {
  return action.type === 'flipInitial' || action.type === 'flipCard' ? action.index : null;
}

/**
 * Les cases qui attendent encore leur valeur, une fois cette grille reçue.
 *
 * Une case cesse d'attendre quand la grille qui fait autorité la montre
 * retournée — ou la fait disparaître avec sa colonne. Pas quand sa requête se
 * termine : en début de manche les deux retournements partent ensemble, et la
 * réponse du premier arrive alors que le second est encore en vol, donc sans
 * vue à afficher. La lâcher là faisait repartir la carte face cachée le temps
 * d'un aller-retour, juste après qu'on l'ait vue tourner.
 *
 * Rend le tableau reçu tel quel quand rien ne change : l'identité sert de
 * comparaison en amont, et un tableau neuf redessinerait la grille pour rien.
 */
export function stillWaiting(
  revealing: readonly number[],
  grid: readonly ViewCell[] | undefined,
): readonly number[] {
  if (!revealing.length) return revealing;
  const waiting = revealing.filter((index) => {
    const cell = grid?.[index];
    return cell != null && !cell.faceUp;
  });
  return waiting.length === revealing.length ? revealing : waiting;
}
