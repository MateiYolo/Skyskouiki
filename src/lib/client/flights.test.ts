import { describe, expect, it } from 'vitest';
import {
  DISCARD_PILE,
  DRAW_PILE,
  HAND,
  cellAnchor,
  clearDelay,
  flightsForEvents,
  revealHold,
} from './flights';
import { FLIGHT_DURATION, FLIGHT_NEXT } from './motion';
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
    const [arrive, depart] = flightsForEvents(view);

    expect(arrive).toEqual({ from: HAND, to: cellAnchor(THEM, 5), value: 7, delay: 0 });
    expect(depart).toEqual({
      from: cellAnchor(THEM, 5),
      to: DISCARD_PILE,
      value: 3,
      delay: FLIGHT_NEXT,
    });
    // Deux cartes qui se croisent au milieu de la table ne se suivent plus.
    expect(depart.delay).toBeGreaterThanOrEqual(FLIGHT_DURATION);
  });

  it('ne rejoue pas mon propre échange : il est déjà parti au doigt', () => {
    const view = makeView({ lastEvents: [placed(ME, 5)] });
    expect(flightsForEvents(view)).toEqual([]);
  });

  it('rejoue en revanche ma propre élimination, que rien n’annonçait', () => {
    const view = makeView({ lastEvents: [placed(ME, 5), cleared(ME, [1, 5, 9])] });
    const flights = flightsForEvents(view);

    expect(flights).toHaveLength(3);
    expect(flights.map((f) => f.from)).toEqual([1, 5, 9].map((i) => cellAnchor(ME, i)));
    expect(new Set(flights.map((f) => f.to))).toEqual(new Set([DISCARD_PILE]));
    // En éventail : on compte les cartes qui partent.
    expect(flights[0].delay).toBeLessThan(flights[1].delay);
    expect(flights[1].delay).toBeLessThan(flights[2].delay);
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
    expect(flightsForEvents(view).map((f) => f.from)).toEqual(
      [8, 9, 11].map((i) => cellAnchor(THEM, i)),
    );
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
