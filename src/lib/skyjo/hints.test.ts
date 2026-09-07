import { describe, expect, it } from 'vitest';
import { clearingIndices, placementHint } from './hints';
import type { ViewCell } from './view';

/** Construit une grille de vue à partir d'une notation compacte.
 *  `n` = valeur face visible, `'?'` = face cachée, `null` = case vidée. */
function grid(cells: Array<number | '?' | null>): ViewCell[] {
  return cells.map((c) =>
    c === null ? null : c === '?' ? { faceUp: false } : { faceUp: true, value: c },
  );
}

const HIDDEN = Array.from({ length: 12 }, () => '?' as const);

describe('placementHint', () => {
  it('donne le solde exact quand on remplace une carte visible', () => {
    const g = grid([9, ...HIDDEN.slice(1)]);
    expect(placementHint(g, 0, 3)).toEqual({ delta: -6, clears: null });
    expect(placementHint(g, 0, 12)).toEqual({ delta: 3, clears: null });
  });

  it('ne devine pas ce qu’on jette quand la case est cachée', () => {
    expect(placementHint(grid(HIDDEN.slice()), 5, 4)).toEqual({ delta: null, clears: null });
  });

  it('repère la colonne complétée et compte les trois cartes qui partent', () => {
    // Colonne 0 = indices 0, 4, 8. Deux 7 déjà posés, un 2 à remplacer.
    const g = grid([2, '?', '?', '?', 7, '?', '?', '?', 7, '?', '?', '?']);
    expect(placementHint(g, 0, 7)).toEqual({ delta: -16, clears: 'column' });
  });

  it('repère la ligne complétée, règle maison comprise', () => {
    const g = grid([5, 5, 5, 1, ...HIDDEN.slice(4)]);
    expect(placementHint(g, 3, 5)).toEqual({ delta: -16, clears: 'row' });
  });

  it('annonce le groupe même sur une case cachée, sans chiffrer le solde', () => {
    const g = grid(['?', '?', '?', '?', 7, '?', '?', '?', 7, '?', '?', '?']);
    expect(placementHint(g, 0, 7)).toEqual({ delta: null, clears: 'column' });
  });

  it('ne voit pas de groupe quand une carte du groupe est encore cachée', () => {
    const g = grid([2, '?', '?', '?', 7, '?', '?', '?', '?', '?', '?', '?']);
    expect(placementHint(g, 0, 7)).toEqual({ delta: 5, clears: null });
  });

  it('ne voit pas de groupe quand une case du groupe est déjà vidée', () => {
    const g = grid([2, '?', '?', '?', 7, '?', '?', '?', null, '?', '?', '?']);
    expect(placementHint(g, 0, 7)?.clears).toBeNull();
  });

  it('refuse une case vidée', () => {
    expect(placementHint(grid([null, ...HIDDEN.slice(1)]), 0, 4)).toBeNull();
  });

  it('trois cartes identiques dans une ligne ne suffisent pas', () => {
    // Ligne 0 = indices 0..3 : il en faut quatre, pas trois.
    const g = grid([5, 5, 1, '?', ...HIDDEN.slice(4)]);
    expect(placementHint(g, 2, 5)?.clears).toBeNull();
  });
});

describe('clearingIndices', () => {
  it('liste toutes les cases qui feraient sauter un groupe', () => {
    const g = grid([2, '?', '?', '?', 7, '?', '?', '?', 7, '?', '?', '?']);
    expect(clearingIndices(g, 7)).toEqual([0]);
    expect(clearingIndices(g, 3)).toEqual([]);
  });
});
