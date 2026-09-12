import { describe, expect, it } from 'vitest';
import { gameMood, pickQuip, roundMood } from './quips';
import type { RoundScore } from '@/lib/skyjo';

/**
 * Une vanne se teste sur deux choses, et deux seulement : qu'elle tombe sur la
 * bonne situation, et qu'elle ne change pas sous les yeux du joueur. Le texte
 * lui-même ne se teste pas — il se lit.
 */

const ME = 'moi';

function score(playerId: string, final: number, patch: Partial<RoundScore> = {}): RoundScore {
  return { playerId, raw: final, final, doubled: false, closedRound: false, ...patch };
}

describe('roundMood', () => {
  it('met la fermeture ratée devant tout le reste', () => {
    // Même en finissant meilleur de la manche : ×2 est ce dont on parlera.
    const scores = [score(ME, 4, { doubled: true, closedRound: true }), score('autre', 30)];
    expect(roundMood(scores, ME)).toBe('doubled');
  });

  it('distingue le négatif, le zéro et la fermeture propre', () => {
    expect(roundMood([score(ME, -3), score('autre', 12)], ME)).toBe('negative');
    expect(roundMood([score(ME, 0), score('autre', 12)], ME)).toBe('zero');
    expect(roundMood([score(ME, 6, { closedRound: true }), score('autre', 12)], ME)).toBe('closed');
  });

  it('relève la fermeture ratée d’un autre quand la mienne est banale', () => {
    const scores = [score(ME, 12), score('autre', 40, { doubled: true, closedRound: true })];
    expect(roundMood(scores, ME)).toBe('theyDoubled');
  });

  it('sépare la victoire large, la victoire serrée et le reste', () => {
    expect(roundMood([score(ME, 5), score('autre', 40)], ME)).toBe('soloWin');
    expect(roundMood([score(ME, 5), score('autre', 7)], ME)).toBe('tightWin');
    expect(roundMood([score(ME, 5), score('autre', 15)], ME)).toBe('win');
  });

  it('mesure l’écart en tête sur le premier poursuivant, pas sur le dernier', () => {
    // Deux points devant le second, trente devant le troisième : c'était serré.
    const scores = [score(ME, 5), score('b', 7), score('c', 45)];
    expect(roundMood(scores, ME)).toBe('tightWin');
  });

  it('traite une égalité en tête comme une victoire serrée', () => {
    expect(roundMood([score(ME, 8), score('autre', 8)], ME)).toBe('tightWin');
  });

  it('sépare la déroute, la défaite au cheveu et le reste', () => {
    expect(roundMood([score(ME, 38), score('autre', 5)], ME)).toBe('crushed');
    expect(roundMood([score(ME, 8), score('autre', 6)], ME)).toBe('tightLoss');
    expect(roundMood([score(ME, 20), score('autre', 6)], ME)).toBe('loss');
  });

  it('distingue le ventre mou du gros total qui n’est pas le pire', () => {
    expect(roundMood([score('a', 2), score(ME, 12), score('c', 40)], ME)).toBe('middle');
    expect(roundMood([score('a', 2), score(ME, 30), score('c', 40)], ME)).toBe('heavy');
  });

  it('ne s’effondre pas sur une feuille de scores vide', () => {
    expect(roundMood([], ME)).toBe('middle');
  });
});

describe('gameMood', () => {
  it('classe la fin de partie sur la marge', () => {
    expect(gameMood(true, 45)).toBe('winBig');
    expect(gameMood(true, 3)).toBe('winTight');
    expect(gameMood(true, 15)).toBe('win');
    expect(gameMood(false, 45)).toBe('loseBig');
    expect(gameMood(false, 3)).toBe('loseTight');
    expect(gameMood(false, 15)).toBe('lose');
  });
});

describe('pickQuip', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'] as const;

  it('rend toujours la même phrase pour la même graine', () => {
    // C'est tout l'intérêt : la feuille de scores se redessine pendant que les
    // jauges montent, et la phrase ne doit pas clignoter d'un rendu à l'autre.
    expect(pickQuip(pool, 1234)).toBe(pickQuip(pool, 1234));
  });

  it('reste dans le pool, quelle que soit la graine', () => {
    for (const seed of [0, -1, 7, 99999, -2147483648, 2147483647]) {
      expect(pool).toContain(pickQuip(pool, seed));
    }
  });

  it('couvre tout le pool sur des graines voisines', () => {
    // Deux manches consécutives ont des versions voisines : sans brassage,
    // elles tireraient toujours des phrases voisines.
    const seen = new Set(Array.from({ length: 60 }, (_, i) => pickQuip(pool, i)));
    expect(seen.size).toBe(pool.length);
  });
});
