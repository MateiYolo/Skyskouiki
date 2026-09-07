import { COLS, GRID_SIZE, ROWS, type Cell, type GroupKind } from './types';

/**
 * Composition officielle du jeu Skyjo : 150 cartes.
 *   -2 ×5, -1 ×10, 0 ×15, puis 1 à 12 ×10 chacune.
 */
export const DECK_COMPOSITION: ReadonlyArray<readonly [value: number, count: number]> = [
  [-2, 5],
  [-1, 10],
  [0, 15],
  [1, 10],
  [2, 10],
  [3, 10],
  [4, 10],
  [5, 10],
  [6, 10],
  [7, 10],
  [8, 10],
  [9, 10],
  [10, 10],
  [11, 10],
  [12, 10],
];

export const DECK_SIZE = 150;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const INITIAL_FLIPS = 2;
export const DEFAULT_TARGET_SCORE = 100;

export function buildDeck(): number[] {
  const deck: number[] = [];
  for (const [value, count] of DECK_COMPOSITION) {
    for (let i = 0; i < count; i++) deck.push(value);
  }
  return deck;
}

/** PRNG déterministe (mulberry32) : même graine = même partie, donc tests reproductibles. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

/** Mélange de Fisher-Yates piloté par la graine. Ne modifie pas l'entrée. */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, seed: s };
}

/** Indices de la grille appartenant à la colonne `col` (haut vers bas). */
export function columnIndices(col: number): number[] {
  return Array.from({ length: ROWS }, (_, row) => col + row * COLS);
}

/** Indices de la grille appartenant à la ligne `row` (gauche vers droite). */
export function rowIndices(row: number): number[] {
  return Array.from({ length: COLS }, (_, col) => row * COLS + col);
}

export function emptyGrid(): Cell[] {
  return Array.from({ length: GRID_SIZE }, () => null);
}

/** Somme des cartes encore présentes dans la grille (les colonnes éliminées valent 0). */
export function gridSum(grid: readonly Cell[]): number {
  return grid.reduce<number>((sum, cell) => (cell ? sum + cell.value : sum), 0);
}

/** Vrai si toutes les cartes restantes sont face visible (grille vide incluse). */
export function isFullyRevealed(grid: readonly Cell[]): boolean {
  return grid.every((cell) => cell === null || cell.faceUp);
}

export function countFaceDown(grid: readonly Cell[]): number {
  return grid.reduce<number>((n, cell) => (cell && !cell.faceUp ? n + 1 : n), 0);
}

export function countFaceUp(grid: readonly Cell[]): number {
  return grid.reduce<number>((n, cell) => (cell && cell.faceUp ? n + 1 : n), 0);
}

/**
 * Valeur commune à toutes ces cases, ou `null` si elles ne forment pas un
 * groupe éliminable (case vide, carte encore cachée, ou valeurs différentes).
 */
function uniformValue(grid: readonly Cell[], indices: readonly number[]): number | null {
  const first = grid[indices[0]];
  if (!first || !first.faceUp) return null;
  for (const i of indices) {
    const cell = grid[i];
    if (!cell || !cell.faceUp || cell.value !== first.value) return null;
  }
  return first.value;
}

export interface ClearedGroup {
  kind: GroupKind;
  /** Numéro de la colonne ou de la ligne concernée. */
  index: number;
  value: number;
}

/**
 * Élimine les groupes de cartes identiques face visible : les colonnes de trois
 * (règle officielle) et les lignes de quatre (règle maison). Les cartes partent
 * à la défausse et ne comptent plus.
 *
 * Les groupes sont d'abord repérés sur la grille intacte, puis retirés d'un
 * bloc : sinon, vider une ligne en premier empêcherait une colonne qui la
 * croise d'être reconnue.
 *
 * Mute `grid` et `discardPile`.
 */
export function clearGroups(grid: Cell[], discardPile: number[]): ClearedGroup[] {
  const found: Array<ClearedGroup & { cells: number[] }> = [];

  for (let col = 0; col < COLS; col++) {
    const cells = columnIndices(col);
    const value = uniformValue(grid, cells);
    if (value !== null) found.push({ kind: 'column', index: col, value, cells });
  }
  for (let row = 0; row < ROWS; row++) {
    const cells = rowIndices(row);
    const value = uniformValue(grid, cells);
    if (value !== null) found.push({ kind: 'row', index: row, value, cells });
  }

  for (const i of new Set(found.flatMap((group) => group.cells))) {
    discardPile.push(grid[i]!.value);
    grid[i] = null;
  }

  return found.map(({ kind, index, value }) => ({ kind, index, value }));
}
