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
 * Nombre minimum de cartes qu'un groupe doit encore contenir pour sauter.
 *
 * Trois, comme une colonne : c'est la taille de groupe que le jeu reconnaît.
 * Une ligne en compte quatre au départ, mais une colonne éliminée lui en
 * retire une — et il n'y a aucune raison qu'une ligne devenue entièrement
 * homogène cesse de compter parce qu'elle a été raccourcie par une élimination
 * précédente.
 */
export const MIN_GROUP = 3;

/**
 * Valeur commune aux cartes encore présentes sur ces cases, ou `null` si elles
 * ne forment pas un groupe éliminable.
 *
 * Une case déjà vidée par une élimination précédente ne bloque pas : elle n'est
 * plus là, elle ne peut pas dépareiller. Ce qui reste doit être face visible,
 * de même valeur, et assez nombreux (`MIN_GROUP`).
 */
function uniformValue(grid: readonly Cell[], indices: readonly number[]): number | null {
  let value: number | null = null;
  let count = 0;
  for (const i of indices) {
    const cell = grid[i];
    if (cell === null) continue;
    if (!cell.faceUp) return null;
    if (count > 0 && cell.value !== value) return null;
    value = cell.value;
    count++;
  }
  return count >= MIN_GROUP ? value : null;
}

export interface ClearedGroup {
  kind: GroupKind;
  /** Numéro de la colonne ou de la ligne concernée. */
  index: number;
  value: number;
  /**
   * Les cases effectivement retirées — celles qui portaient encore une carte.
   * L'interface s'en sert pour montrer *lesquelles* partent : sur une ligne
   * raccourcie par une colonne déjà éliminée, les indices de la ligne entière
   * feraient apparaître une carte fantôme sur le trou.
   */
  cells: number[];
}

/**
 * Élimine les groupes de cartes identiques face visible : les colonnes de trois
 * (règle officielle) et les lignes entièrement homogènes (règle maison). Les
 * cartes partent à la défausse et ne comptent plus.
 *
 * Les groupes sont d'abord repérés sur la grille intacte, puis retirés d'un
 * bloc : sinon, vider une ligne en premier empêcherait une colonne qui la
 * croise d'être reconnue.
 *
 * Mute `grid` et `discardPile`.
 */
export function clearGroups(grid: Cell[], discardPile: number[]): ClearedGroup[] {
  const found: ClearedGroup[] = [];

  const collect = (kind: GroupKind, index: number, indices: number[]) => {
    const value = uniformValue(grid, indices);
    if (value === null) return;
    found.push({ kind, index, value, cells: indices.filter((i) => grid[i] !== null) });
  };

  for (let col = 0; col < COLS; col++) collect('column', col, columnIndices(col));
  for (let row = 0; row < ROWS; row++) collect('row', row, rowIndices(row));

  for (const i of new Set(found.flatMap((group) => group.cells))) {
    discardPile.push(grid[i]!.value);
    grid[i] = null;
  }

  return found;
}
