'use client';

import { JOKER_CARD, type GameView, type PileCard, type ValueCard } from '@/lib/skyjo';
import {
  CLEAR_HOLD,
  CLEAR_STAGGER,
  FLIGHT_DURATION,
  FLIGHT_NEXT,
  FLIP,
} from './motion';
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
 * l'exécute, et ignore ensuite les événements dont je suis l'auteur — sauf les
 * éliminations, que personne n'a pu anticiper puisqu'elles n'existent que dans
 * l'état d'après.
 *
 * Tout est daté. Un coup, ce n'est pas un ensemble de cartes qui bougent en
 * même temps, c'est une suite : je prends, je pose, ce que je remplace s'en
 * va, et la colonne saute. Jouées ensemble, ces quatre choses sont un
 * clignotement ; jouées l'une après l'autre, elles se racontent.
 */

/** Emplacements nommés, déclarés en `data-anchor` par les composants. */
export const DRAW_PILE = 'pile-draw';
export const DISCARD_PILE = 'pile-discard';
export const HAND = 'hand';
export const cellAnchor = (playerId: string, index: number) => `cell-${playerId}-${index}`;

export interface FlightRequest {
  from: string;
  to: string;
  /**
   * `null` = carte face cachée : on sait qu'elle bouge, pas ce qu'elle vaut.
   * Un Vol peut voler lui aussi, de la pioche jusqu'à la main.
   */
  value: PileCard | null;
  delay: number;
  /**
   * Durée pendant laquelle la carte reste posée sur `from` au lieu de voler.
   *
   * Sert à une seule chose : couvrir la case qu'un échange va remplacer. La
   * grille affiche déjà la carte d'après, donc sans ce cache on la voit
   * arriver deux fois — une fois posée, une fois en vol au-dessus d'elle.
   */
  hold?: number;
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

/**
 * Le cache de la défausse : ce que la pile montrait, gardé par-dessus elle
 * jusqu'à ce que la carte suivante s'y pose.
 *
 * Même défaut que sur une case de grille, et il se voyait autant : la pile
 * affiche déjà la carte d'après. Sans ce cache on lit le 12 sur la défausse
 * pendant que le 12 met encore une demi-seconde à y arriver — la valeur est
 * révélée avant son voyage, ce qui est précisément ce que le voyage devait
 * raconter.
 *
 * Le cache passe *sous* la carte en vol : une carte se pose sur une pile, elle
 * ne se glisse pas dessous. C'est pourquoi il s'émet toujours en premier.
 */
function coverDiscard(value: ValueCard | null, from: number, until: number): FlightRequest[] {
  if (value === null || until <= from) return [];
  return [{ from: DISCARD_PILE, to: DISCARD_PILE, value, delay: from, hold: until - from }];
}

/**
 * Un échange, dans l'ordre où il se lit : la carte arrive, se glisse sous celle
 * qu'elle remplace, et celle-là s'en va.
 *
 * Les trois éléments partagent une seule horloge. `hold` couvre la case
 * exactement jusqu'au départ de l'ancienne carte : avant, on verrait la
 * nouvelle deux fois ; après, l'ancienne réapparaîtrait une fraction de
 * seconde avant de s'envoler.
 *
 * L'ordre du tableau est l'ordre d'empilement : la carte qui arrive passe
 * *sous* celle qui s'en va, comme sur une table.
 */
function swap(cell: string, arriving: ValueCard, leaving: ValueCard | null): FlightRequest[] {
  return [
    { from: HAND, to: cell, value: arriving, delay: 0 },
    { from: cell, to: cell, value: leaving, delay: 0, hold: FLIGHT_NEXT },
    { from: cell, to: DISCARD_PILE, value: leaving, delay: FLIGHT_NEXT },
  ];
}

/**
 * Un vol : deux cartes qui se croisent entre deux grilles.
 *
 * Même principe que `swap`, en double. Chaque case garde un instant la carte
 * qui la quitte — la grille affiche déjà celle qui arrive — puis les deux
 * partent en même temps, chacune vers la case de l'autre. C'est le seul
 * mouvement du jeu qui traverse le terrain dans les deux sens à la fois, et
 * c'est exactement ce qu'un vol est.
 *
 * Une carte face cachée voyage sur son dos (`value: null`) : elle change de
 * grille sans se retourner, et le trajet ne doit pas en dire plus que la
 * table.
 */
function cross(
  thiefCell: string,
  victimCell: string,
  given: ValueCard | null,
  taken: ValueCard | null,
): FlightRequest[] {
  return [
    { from: thiefCell, to: thiefCell, value: given, delay: 0, hold: FLIGHT_NEXT },
    { from: victimCell, to: victimCell, value: taken, delay: 0, hold: FLIGHT_NEXT },
    { from: thiefCell, to: victimCell, value: given, delay: FLIGHT_NEXT },
    { from: victimCell, to: thiefCell, value: taken, delay: FLIGHT_NEXT },
  ];
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
        : [
            ...coverDiscard(view.discardTop, 0, FLIGHT_DURATION),
            { from: HAND, to: DISCARD_PILE, value: view.heldCard, delay: 0 },
          ];

    case 'placeCard': {
      if (view.heldCard === null) return [];
      const cell = view.players.find((p) => p.id === playerId)?.grid[action.index];
      if (cell === undefined || cell === null) return [];
      // Ma propre carte cachée reste cachée : le serveur ne m'a pas encore dit
      // ce qu'il y avait dessous, et on n'invente pas une valeur.
      return [
        ...coverDiscard(view.discardTop, 0, FLIGHT_NEXT + FLIGHT_DURATION),
        ...swap(cellAnchor(playerId, action.index), view.heldCard, cell.faceUp ? cell.value : null),
      ];
    }

    default:
      return [];
  }
}

/**
 * Le moment où le terrain redevient calme, ce lot d'événements joué.
 *
 * Sert à faire attendre les éliminations : une colonne qui saute pendant que
 * la carte qui l'a complétée est encore en vol, c'est trois disparitions sans
 * cause visible. On la laisse arriver, on marque un temps, puis les cartes
 * s'en vont.
 *
 * Mes propres échanges ont déjà décollé au doigt : ils sont un peu plus
 * avancés que ce compte ne le dit, le temps de l'aller-retour réseau. Attendre
 * la même échéance leur laisse simplement un peu de rab.
 */
function settledAt(view: GameView): number {
  let t = 0;
  const at = (d: number) => {
    t = Math.max(t, d);
  };
  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
      case 'discarded':
        at(FLIGHT_DURATION);
        break;
      case 'placed':
      // Un vol peut fermer une colonne — des deux côtés. Les cartes du groupe
      // ne partent donc qu'une fois le croisement posé.
      case 'stole':
        at(FLIGHT_NEXT + FLIGHT_DURATION);
        break;
      case 'flipped':
      case 'initialFlip':
        at(FLIP.duration as number);
        break;
      default:
        break;
    }
  }
  return t;
}

/** Quand les cartes d'un groupe éliminé quittent la grille, ce lot joué. */
export function clearDelay(view: GameView): number {
  return settledAt(view) + CLEAR_HOLD;
}

/** Le temps de lire une table qui vient de se retourner en entier. */
const READ_BOARD = 1.6;

/**
 * Combien de temps (en millisecondes) laisser la table sous les yeux avant
 * d'afficher les scores.
 *
 * La fin de manche est le seul moment où tout arrive d'un coup : le dernier
 * joueur pose sa carte, toutes les grilles se retournent, et les colonnes que
 * ça révèle sautent. Poser la feuille de scores par-dessus pendant que ça se
 * produit, c'est escamoter la seule chose que tout le monde attendait — ce
 * qu'il y avait sous les dernières cartes. On attend donc que le dernier
 * mouvement soit fini, et on laisse encore le temps de faire le tour des
 * grilles.
 */
export function revealHold(view: GameView): number {
  let widest = 0;
  for (const event of view.lastEvents) {
    if (event.type === 'groupCleared') widest = Math.max(widest, event.cells.length);
  }
  const flying = widest ? FLIGHT_DURATION + (widest - 1) * CLEAR_STAGGER : 0;
  return (clearDelay(view) + flying + READ_BOARD) * 1000;
}

/**
 * Ce qui se pose sur la défausse pendant ce lot, et quand.
 *
 * Une seule action peut y déposer plusieurs cartes : celle qu'un échange
 * remplace, puis les trois d'une colonne éliminée. La pile n'affiche pourtant
 * qu'une valeur — la dernière — dès l'arrivée de l'état. Il faut donc rejouer
 * son dessus carte par carte, sinon la pile passe de son ancien sommet au
 * sommet final sans jamais montrer ce qu'il y avait entre les deux.
 *
 * Rendu dans l'ordre chronologique, cache compris.
 */
function discardLandings(
  view: GameView,
  clearedAt: number,
): Array<{ value: ValueCard; at: number; mine: boolean }> {
  const landings: Array<{ value: ValueCard; at: number; mine: boolean }> = [];
  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
        // Une prise dans la défausse en retire le dessus : ce qui réapparaît
        // dessous, seul le serveur le sait. Aucun cache possible, on renonce.
        if (event.from === 'discard') return [];
        break;
      case 'discarded':
        landings.push({ value: event.value, at: FLIGHT_DURATION, mine: event.playerId === view.you.id });
        break;
      case 'placed':
        landings.push({
          value: event.discarded,
          at: FLIGHT_NEXT + FLIGHT_DURATION,
          mine: event.playerId === view.you.id,
        });
        break;
      case 'groupCleared':
        event.cells.forEach((index, rank) => {
          // Le joker s'en retourne dans la pioche : il ne se pose jamais sur la
          // défausse, donc il n'a rien à y recouvrir.
          if ((event.jokers ?? []).includes(index)) return;
          landings.push({
            value: event.value,
            at: clearedAt + rank * CLEAR_STAGGER + FLIGHT_DURATION,
            mine: event.playerId === view.you.id,
          });
        });
        break;
      default:
        break;
    }
  }
  return landings.sort((a, b) => a.at - b.at);
}

/**
 * Ce qui doit voler quand *quelqu'un d'autre* vient de jouer.
 *
 * `previousDiscardTop` est ce que la défausse montrait avant ce lot : la vue
 * reçue montre déjà le résultat, et il faut de quoi la recouvrir le temps que
 * la carte y arrive.
 */
export function flightsForEvents(
  view: GameView,
  previousDiscardTop: ValueCard | null = null,
): FlightRequest[] {
  const out: FlightRequest[] = [];
  const cleared = clearDelay(view);

  // Les caches d'abord : ils doivent passer sous les cartes qui se posent.
  // Le tout premier n'est émis que si le coup n'est pas le mien — quand c'est
  // moi qui joue, `flightsForAction` l'a déjà posé au doigt, une demi-seconde
  // plus tôt, et le réémettre ici retarderait la pile d'autant.
  const landings = discardLandings(view, cleared);
  landings.forEach((landing, i) => {
    const previous = landings[i - 1];
    if (!previous && landing.mine) return;
    const showing = previous?.value ?? previousDiscardTop;
    // Un cache qui montre ce que la pile montre déjà ne cache rien : c'est le
    // cas des trois cartes d'une colonne, toutes de la même valeur que le
    // sommet final. Elles se posent sur elles-mêmes, et c'est très bien.
    if (showing === view.discardTop) return;
    out.push(...coverDiscard(showing, previous?.at ?? 0, landing.at));
  });

  for (const event of view.lastEvents) {
    switch (event.type) {
      case 'drew':
        // Mes propres coups ont déjà volé, au doigt.
        if (view.currentPlayerId === view.you.id) break;
        out.push({
          from: event.from === 'draw' ? DRAW_PILE : DISCARD_PILE,
          to: HAND,
          value: view.heldCard,
          delay: 0,
        });
        break;
      case 'placed': {
        if (event.playerId === view.you.id) break;
        // Ici la carte remplacée est connue : elle vient d'atterrir sur la
        // défausse, tout le monde l'a vue.
        out.push(...swap(cellAnchor(event.playerId, event.index), event.placed, event.discarded));
        break;
      }
      case 'discarded':
        if (event.playerId === view.you.id) break;
        out.push({ from: HAND, to: DISCARD_PILE, value: event.value, delay: 0 });
        break;
      // Le vol se rejoue pour tout le monde, voleur compris : contrairement aux
      // autres coups, il n'a pas décollé au doigt — rien n'en était connu avant
      // la réponse du serveur, et la grille d'en face change en même temps que
      // la mienne.
      case 'stole':
        out.push(
          ...cross(
            cellAnchor(event.playerId, event.index),
            cellAnchor(event.targetPlayerId, event.targetIndex),
            event.given,
            event.taken,
          ),
        );
        break;
      // Une élimination, elle, se rejoue pour tout le monde — la mienne
      // comprise : personne ne l'a vue venir, elle n'existe que dans l'état
      // d'après. Les cartes restent en place le temps qu'on les lise
      // (`ClearGhost`), puis partent à la défausse l'une après l'autre.
      case 'groupCleared':
        event.cells.forEach((index, rank) => {
          // Le joker ne suit pas le groupe : il repart dans la pioche, et le
          // trajet doit le montrer. Le voir se poser sur la défausse ferait
          // croire qu'on peut le reprendre au coup suivant — c'est précisément
          // ce que la règle lui interdit.
          const joker = (event.jokers ?? []).includes(index);
          out.push({
            from: cellAnchor(event.playerId, index),
            to: joker ? DRAW_PILE : DISCARD_PILE,
            value: joker ? JOKER_CARD : event.value,
            delay: cleared + rank * CLEAR_STAGGER,
          });
        });
        break;
      default:
        break;
    }
  }

  return out;
}
