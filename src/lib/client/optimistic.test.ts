import { describe, expect, it } from 'vitest';
import { optimisticView, revealingIndex } from './optimistic';
import type { GameView, ViewCell } from '@/lib/skyjo';

/**
 * La vue optimiste est un pari : elle affiche le coup avant que le serveur ne
 * l'ait confirmé. Ce qui se teste ici, c'est qu'elle ne parie que sur ce qu'elle
 * sait — jamais sur une valeur cachée — et qu'elle verrouille bien la grille le
 * temps de la réponse.
 */

const ME = 'moi';

function cell(value: number): ViewCell {
  return { faceUp: true, value };
}

function hidden(): ViewCell {
  return { faceUp: false };
}

function makeView(patch: Partial<GameView> = {}): GameView {
  const grid: ViewCell[] = [cell(5), hidden(), hidden(), hidden(), hidden(), hidden(), hidden(), hidden(), hidden(), hidden(), hidden(), hidden()];
  return {
    id: 'g',
    code: '1234',
    version: 7,
    phase: 'playing',
    round: 1,
    targetScore: 100,
    hostId: ME,
    players: [
      {
        id: ME,
        name: 'Matei',
        emoji: '🦊',
        connected: true,
        grid,
        totalScore: 0,
        roundScores: [],
        faceDownCount: 11,
        faceUpCount: 1,
        visibleSum: 5,
      },
    ],
    currentPlayerId: ME,
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
    you: { id: ME, isHost: true, isCurrent: true },
    legalActions: ['drawFromPile', 'takeDiscard'],
    ...patch,
  };
}

describe('optimisticView', () => {
  it('ne révèle jamais la valeur d’une carte retournée', () => {
    const view = makeView({ legalActions: ['flipCard'] });
    const next = optimisticView(view, { type: 'flipCard', index: 1 }, ME)!;
    expect(next.players[0].grid[1]).toEqual({ faceUp: false });
    // Le retournement de fin de tour est unique : la grille se ferme derrière.
    expect(next.legalActions).toEqual([]);
  });

  it('laisse enchaîner les deux retournements du début de manche', () => {
    const view = makeView({ phase: 'initialFlip', legalActions: ['flipInitial'] });
    const next = optimisticView(view, { type: 'flipInitial', index: 1 }, ME)!;
    expect(next.legalActions).toEqual(['flipInitial']);
    expect(next.players[0].grid[1]).toEqual({ faceUp: false });
  });

  it('pioche une carte face cachée, dont la valeur viendra du serveur', () => {
    const next = optimisticView(makeView(), { type: 'drawFromPile' }, ME)!;
    expect(next.turnStep).toBe('holding');
    expect(next.heldFrom).toBe('draw');
    expect(next.heldCard).toBeNull();
  });

  it('prend le sommet de la défausse, qui lui est public', () => {
    const next = optimisticView(makeView(), { type: 'takeDiscard' }, ME)!;
    expect(next.heldCard).toBe(9);
    expect(next.heldFrom).toBe('discard');
    // Ce qu'il y a dessous est inconnu : on n'invente pas de carte.
    expect(next.discardTop).toBeNull();
  });

  it('jette la carte tenue et enchaîne sur le retournement obligatoire', () => {
    const view = makeView({ turnStep: 'holding', heldFrom: 'draw', heldCard: 12 });
    const next = optimisticView(view, { type: 'discardHeld' }, ME)!;
    expect(next.discardTop).toBe(12);
    expect(next.heldCard).toBeNull();
    expect(next.turnStep).toBe('mustFlip');
    expect(next.legalActions).toEqual(['flipCard']);
  });

  it('pose la carte tenue et recompte le score de la manche', () => {
    const view = makeView({ turnStep: 'holding', heldFrom: 'draw', heldCard: 2 });
    const next = optimisticView(view, { type: 'placeCard', index: 0 }, ME)!;
    const me = next.players[0];
    expect(me.grid[0]).toEqual({ faceUp: true, value: 2 });
    expect(me.visibleSum).toBe(2);
    expect(me.faceUpCount).toBe(1);
    // Le 5 remplacé était visible : il part sur la défausse.
    expect(next.discardTop).toBe(5);
    expect(next.heldCard).toBeNull();
  });

  it('laisse la défausse au serveur quand la case remplacée était cachée', () => {
    const view = makeView({ turnStep: 'holding', heldFrom: 'draw', heldCard: 2 });
    const next = optimisticView(view, { type: 'placeCard', index: 1 }, ME)!;
    expect(next.players[0].grid[1]).toEqual({ faceUp: true, value: 2 });
    expect(next.discardTop).toBe(9); // inchangé : on ignore ce qui a été jeté
  });

  it('renonce quand il manque une information', () => {
    expect(optimisticView(makeView({ discardTop: null }), { type: 'takeDiscard' }, ME)).toBeNull();
    expect(optimisticView(makeView(), { type: 'discardHeld' }, ME)).toBeNull();
    expect(optimisticView(makeView(), { type: 'placeCard', index: 0 }, ME)).toBeNull();
    expect(optimisticView(makeView(), { type: 'startGame' }, ME)).toBeNull();
  });

  it('ne modifie pas la vue reçue', () => {
    const view = makeView({ turnStep: 'holding', heldFrom: 'draw', heldCard: 2 });
    optimisticView(view, { type: 'placeCard', index: 0 }, ME);
    expect(view.players[0].grid[0]).toEqual({ faceUp: true, value: 5 });
    expect(view.heldCard).toBe(2);
  });
});

describe('revealingIndex', () => {
  it('ne désigne que les coups dont on attend une valeur', () => {
    expect(revealingIndex({ type: 'flipCard', index: 4 })).toBe(4);
    expect(revealingIndex({ type: 'flipInitial', index: 0 })).toBe(0);
    expect(revealingIndex({ type: 'placeCard', index: 3 })).toBeNull();
    expect(revealingIndex({ type: 'drawFromPile' })).toBeNull();
  });
});
