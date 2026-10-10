import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  boardFor,
  placeFor,
  rankBoard,
  rankLabel,
  suggestInitials,
  type RecordEntry,
} from './records';

function entry(score: number, at = 0): RecordEntry {
  return { id: `${score}-${at}`, initials: 'AAA', score, rounds: 4, players: 2, spicy: false, at };
}

describe('tableau des records', () => {
  it('range celui qui franchit la barre au tableau de la honte, les autres aux meilleurs', () => {
    expect(boardFor(99, 100)).toBe('best');
    expect(boardFor(100, 100)).toBe('shame');
    expect(boardFor(-12, 100)).toBe('best');
  });

  it('classe les meilleurs du plus bas au plus haut, la honte dans l’autre sens', () => {
    const entries = [entry(30), entry(-4), entry(12)];
    expect(rankBoard('best', entries).map((e) => e.score)).toEqual([-4, 12, 30]);
    expect(rankBoard('shame', entries).map((e) => e.score)).toEqual([30, 12, -4]);
  });

  it('laisse l’ancien devant à score égal : égaler un record ne suffit pas', () => {
    const ranked = rankBoard('best', [entry(10, 2), entry(10, 1)]);
    expect(ranked.map((e) => e.at)).toEqual([1, 2]);
    expect(placeFor('best', [entry(10)], 10)).toBe(1);
    expect(placeFor('best', [entry(10)], 9)).toBe(0);
  });

  it('ne garde que dix lignes, et refuse le onzième', () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry(i * 5));
    expect(rankBoard('best', [...full, entry(100)])).toHaveLength(BOARD_SIZE);
    expect(placeFor('best', full, 45)).toBeNull();
    expect(placeFor('best', full, 44)).toBe(BOARD_SIZE - 1);
    expect(placeFor('shame', full, 46)).toBe(0);
  });

  it('ouvre grand les portes d’un tableau vide', () => {
    expect(placeFor('best', [], 98)).toBe(0);
    expect(placeFor('shame', [], 100)).toBe(0);
  });

  it('propose les trois premières lettres du prénom, accents ôtés', () => {
    expect(suggestInitials('Éloïse')).toBe('ELO');
    expect(suggestInitials('Al')).toBe('AL.');
    expect(suggestInitials('🦊')).toBe('...');
    expect(suggestInitials('jean-marc')).toBe('JEA');
  });

  it('écrit les rangs comme une borne française', () => {
    expect(rankLabel(0)).toBe('1ER');
    expect(rankLabel(1)).toBe('2E');
    expect(rankLabel(9)).toBe('10E');
  });
});
