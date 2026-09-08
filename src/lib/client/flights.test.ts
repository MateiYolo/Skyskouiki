import { describe, expect, it } from 'vitest';
import {
  DISCARD_PILE,
  DRAW_PILE,
  HAND,
  cellAnchor,
  clearDelay,
  flightsForAction,
  flightsForEvents,
  revealHold,
  type FlightRequest,
} from './flights';
import { CLEAR_STAGGER, FLIGHT_DURATION, FLIGHT_NEXT } from './motion';
import type { GameEvent, GameView, ViewCell } from '@/lib/skyjo';

/**
 * Ce qui se teste ici, c'est la **chronologie** d'un coup.
 *
 * Un coup n'est pas un ensemble de cartes qui bougent en même temps : je
 * prends, je pose, ce que je remplace s'en va, et la colonne saute. Jouées
 * ensemble, ces quatre choses sont un clignotement ; c'est l'ordre qui les rend
 * lisibles. Et deux calques indépendants doivent s'accorder à la milliseconde —
 * le fantôme d'une carte éliminée (`ClearEcho.delay`) et son décollage
 * (`flightsForEvents`) — sinon on voit la carte deux fois, ou pas du tout.
 */

const ME = 'moi';
const THEM = 'lautre';

function makeView(patch: Partial<GameView> = {}): GameView {
  const grid: ViewCell[] = Array.from({ length: 12 }, () => ({ faceUp: false }) as ViewCell);
  const player = (id: string) => ({
    id,
    name: id,
    emoji: '🦊',
    connected: true,
    grid,
    totalScore: 0,
    roundScores: [],
    faceDownCount: 12,
    faceUpCount: 0,
    visibleSum: 0,
  });
  return {
    id: 'g',
    code: '1234',
    version: 12,
    phase: 'playing',
    round: 1,
    targetScore: 100,
    hostId: ME,
    players: [player(ME), player(THEM)],
    currentPlayerId: THEM,
    turnStep: 'choose',
    drawPileCount: 40,
    discardTop: 9,
    discardCount: 3,
    heldCard: null,
    heldFrom: null,
    roundCloserId: null,
    finalTurnsLeft: null,
    lastEvents: [],
    lastRoundScores: null,
    winnerId: null,
    you: { id: ME, isHost: true, isCurrent: false },
    legalActions: [],
    ...patch,
  };
}

const placed = (playerId: string, index: number): GameEvent => ({
  type: 'placed',
  playerId,
  index,
  placed: 7,
  discarded: 3,
});

/** Ce qui bouge, par opposition aux caches qui attendent sur place. */
const moving = (flights: FlightRequest[]) => flights.filter((f) => !f.hold);

/** Les caches posés sur la défausse, dans l'ordre où ils s'y succèdent. */
const covers = (flights: FlightRequest[]) =>
  flights.filter((f) => f.hold && f.from === DISCARD_PILE);

const cleared = (
  playerId: string,
  cells: number[],
  kind: 'column' | 'row' = 'column',
): GameEvent => ({
  type: 'groupCleared',
  playerId,
  kind,
  index: 1,
  value: 7,
  cells,
});

describe('flightsForEvents', () => {
  it('montre la carte que l’adversaire vient de piocher', () => {
    const view = makeView({
      heldCard: 4,
      heldFrom: 'draw',
      lastEvents: [{ type: 'drew', playerId: THEM, from: 'draw' }],
    });
    expect(flightsForEvents(view)).toEqual([
      { from: DRAW_PILE, to: HAND, value: 4, delay: 0 },
    ]);
  });

  it('fait partir la carte remplacée seulement une fois l’autre posée', () => {
    const view = makeView({ lastEvents: [placed(THEM, 5)] });
    const cell = cellAnchor(THEM, 5);
    const [arrive, mask, depart] = flightsForEvents(view);

    expect(arrive).toEqual({ from: HAND, to: cell, value: 7, delay: 0 });
    expect(depart).toEqual({ from: cell, to: DISCARD_PILE, value: 3, delay: FLIGHT_NEXT });
    // Deux cartes qui se croisent au milieu de la table ne se suivent plus.
    expect(depart.delay).toBeGreaterThanOrEqual(FLIGHT_DURATION);

    // La case affiche déjà la carte d'après : sans ce cache, on la verrait
    // posée avant de la voir arriver. Il tient pile jusqu'au départ de
    // l'ancienne, et il est empilé après elle — la nouvelle se glisse dessous.
    expect(mask).toEqual({ from: cell, to: cell, value: 3, delay: 0, hold: FLIGHT_NEXT });
    expect(mask.hold).toBe(depart.delay);
  });

  it('ne rejoue pas mon propre échange : il est déjà parti au doigt', () => {
    const view = makeView({ lastEvents: [placed(ME, 5)] });
    expect(flightsForEvents(view)).toEqual([]);
  });

  it('rejoue en revanche ma propre élimination, que rien n’annonçait', () => {
    const view = makeView({ lastEvents: [placed(ME, 5), cleared(ME, [1, 5, 9])] });
    const flights = flightsForEvents(view);

    const flying = moving(flights);
    expect(flying).toHaveLength(3);
    expect(flying.map((f) => f.from)).toEqual([1, 5, 9].map((i) => cellAnchor(ME, i)));
    expect(new Set(flying.map((f) => f.to))).toEqual(new Set([DISCARD_PILE]));
    // En éventail : on compte les cartes qui partent.
    expect(flying[0].delay).toBeLessThan(flying[1].delay);
    expect(flying[1].delay).toBeLessThan(flying[2].delay);
  });

  it('laisse l’échange se terminer avant de vider la colonne', () => {
    const view = makeView({ lastEvents: [placed(THEM, 5), cleared(THEM, [1, 5, 9])] });
    // Trois cartes qui disparaissent pendant que celle qui les a réunies est
    // encore en l'air, ce sont trois disparitions sans cause visible.
    expect(clearDelay(view)).toBeGreaterThan(FLIGHT_NEXT + FLIGHT_DURATION);
  });

  it('accorde le fantôme et le décollage sur le même instant', () => {
    const view = makeView({ lastEvents: [placed(THEM, 5), cleared(THEM, [1, 5, 9])] });
    const first = flightsForEvents(view).find((f) => f.from === cellAnchor(THEM, 1))!;
    // `ClearEcho.delay` vient de là : la carte s'efface pile quand elle décolle.
    expect(first.delay).toBe(clearDelay(view));
  });

  it('n’invente pas de carte sur un trou déjà présent dans la ligne', () => {
    // Ligne raccourcie par une colonne déjà éliminée : trois cases, pas quatre.
    const view = makeView({
      lastEvents: [cleared(THEM, [8, 9, 11], 'row')],
    });
    expect(moving(flightsForEvents(view)).map((f) => f.from)).toEqual(
      [8, 9, 11].map((i) => cellAnchor(THEM, i)),
    );
  });
});

describe('le dessus de la défausse', () => {
  it('garde l’ancienne carte visible jusqu’à ce que la nouvelle s’y pose', () => {
    const view = makeView({
      discardTop: 4,
      lastEvents: [{ type: 'discarded', playerId: THEM, value: 4 }],
    });
    const flights = flightsForEvents(view, 9);

    // La pile affiche déjà le 4 : sans le cache, il est lu avant d'arriver.
    expect(covers(flights)).toEqual([
      { from: DISCARD_PILE, to: DISCARD_PILE, value: 9, delay: 0, hold: FLIGHT_DURATION },
    ]);
    // Et le cache passe sous la carte qui se pose, pas dessus.
    expect(flights.indexOf(covers(flights)[0])).toBeLessThan(
      flights.findIndex((f) => !f.hold && f.to === DISCARD_PILE),
    );
  });

  it('rejoue le dessus carte par carte quand plusieurs s’y posent', () => {
    // Un échange qui déclenche une colonne : la carte remplacée se pose, puis
    // les trois de la colonne. La pile n'affiche que la dernière.
    // Après la colonne, la pile affiche le 7 : c'est la dernière carte posée.
    const view = makeView({
      discardTop: 7,
      lastEvents: [placed(THEM, 5), cleared(THEM, [1, 5, 9])],
    });
    const [first, second, ...rest] = covers(flightsForEvents(view, 9));

    expect(rest).toEqual([]);
    // D'abord l'ancien dessus, jusqu'à ce que la carte remplacée arrive.
    expect(first).toMatchObject({ value: 9, delay: 0 });
    expect(first.delay + first.hold!).toBe(FLIGHT_NEXT + FLIGHT_DURATION);
    // Puis la carte remplacée, jusqu'à la première carte de la colonne.
    expect(second).toMatchObject({ value: 3, delay: FLIGHT_NEXT + FLIGHT_DURATION });
    expect(second.delay + second.hold!).toBe(clearDelay(view) + FLIGHT_DURATION);
  });

  it('ne recouvre pas deux fois mon propre coup, déjà couvert au doigt', () => {
    const view = makeView({
      discardTop: 7,
      lastEvents: [placed(ME, 5), cleared(ME, [1, 5, 9])],
    });
    const list = covers(flightsForEvents(view, 9));

    // `flightsForAction` a posé le premier cache une demi-seconde plus tôt ;
    // le réémettre ici retarderait la pile d'un aller-retour réseau.
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ value: 3, delay: FLIGHT_NEXT + FLIGHT_DURATION });
  });

  it('recouvre au doigt, sans attendre le serveur', () => {
    const view = makeView({ discardTop: 9, heldCard: 6, heldFrom: 'draw', you: { id: ME, isHost: true, isCurrent: true } });
    expect(covers(flightsForAction(view, { type: 'discardHeld' }, ME))).toEqual([
      { from: DISCARD_PILE, to: DISCARD_PILE, value: 9, delay: 0, hold: FLIGHT_DURATION },
    ]);
  });

  it('renonce à recouvrir quand quelqu’un vient d’y prendre une carte', () => {
    // Le dessus a sauté : ce qui réapparaît dessous, seul le serveur le sait.
    const view = makeView({
      heldCard: 9,
      heldFrom: 'discard',
      lastEvents: [{ type: 'drew', playerId: THEM, from: 'discard' }],
    });
    expect(covers(flightsForEvents(view, 9))).toEqual([]);
  });

  it('ne pose pas de cache là où la pile ne change pas', () => {
    // Les trois cartes d'une colonne ont la même valeur que le sommet final :
    // elles se posent sur elles-mêmes. Seule la première a quelque chose à
    // cacher — l'ancien dessus.
    const view = makeView({ discardTop: 7, lastEvents: [cleared(THEM, [1, 5, 9])] });
    const list = covers(flightsForEvents(view, 9));

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ value: 9, delay: 0 });
    expect(list[0].hold).toBe(clearDelay(view) + FLIGHT_DURATION);
    // Les cartes, elles, restent espacées.
    const flying = moving(flightsForEvents(view, 9));
    expect(flying[1].delay - flying[0].delay).toBeCloseTo(CLEAR_STAGGER);
  });
});

describe('revealHold', () => {
  it('laisse voir la dernière carte retournée avant les scores', () => {
    const view = makeView({
      phase: 'roundOver',
      lastEvents: [
        { type: 'flipped', playerId: THEM, index: 11, value: 12 },
        { type: 'roundOver', scores: [] },
      ],
    });
    expect(revealHold(view)).toBeGreaterThan(1500);
  });

  it('attend plus longtemps quand le dévoilement final fait sauter un groupe', () => {
    const base = makeView({
      phase: 'roundOver',
      lastEvents: [{ type: 'flipped', playerId: THEM, index: 11, value: 12 }],
    });
    const withClear = makeView({
      phase: 'roundOver',
      lastEvents: [...base.lastEvents, cleared(THEM, [1, 5, 9])],
    });
    expect(revealHold(withClear)).toBeGreaterThan(revealHold(base));
  });
});
