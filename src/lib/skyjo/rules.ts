import { COLS, GRID_SIZE, type Cell } from './types';

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
  let t = (seed + 0x6d2b79f5) | 0;
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
  return [col, col + COLS, col + COLS * 2];
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
 * Applique la règle des colonnes : trois cartes identiques face visible dans une
 * même colonne sont retirées de la grille et posées sur la défausse.
 * Mute `grid` et `discardPile`, renvoie les colonnes éliminées.
 */
export function clearColumns(
  grid: Cell[],
  discardPile: number[],
): Array<{ column: number; value: number }> {
  const cleared: Array<{ column: number; value: number }> = [];
  for (let col = 0; col < COLS; col++) {
    const idx = columnIndices(col);
    const cells = idx.map((i) => grid[i]);
    if (cells.some((c) => c === null || !c.faceUp)) continue;
    const value = cells[0]!.value;
    if (!cells.every((c) => c!.value === value)) continue;
    for (const i of idx) {
      discardPile.push(grid[i]!.value);
      grid[i] = null;
    }
    cleared.push({ column: col, value });
  }
  return cleared;
}
