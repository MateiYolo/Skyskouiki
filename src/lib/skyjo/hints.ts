import { columnIndices, rowIndices } from './rules';
import { COLS, ROWS } from './types';
import type { ViewCell } from './view';

/**
 * Ce qu'un joueur peut déduire de sa propre grille avant de poser une carte.
 *
 * Rien ici n'est secret : tout se calcule à partir de la vue expurgée, avec les
 * seules cartes que le joueur voit déjà. C'est de l'arithmétique qu'il ferait de
 * tête sur une vraie table — l'écran la lui épargne, il ne lui apprend rien.
 */

export interface PlacementHint {
  /**
   * Variation du score si la carte tenue atterrit ici.
   * `null` quand la case est cachée : sa valeur est inconnue, donc le calcul aussi.
   */
  delta: number | null;
  /** Le placement complète un groupe identique, qui saute aussitôt. */
  clears: 'column' | 'row' | null;
}

function faceValue(cell: ViewCell): number | null {
  return cell && cell.faceUp ? cell.value : null;
}

/**
 * Vrai si toutes les autres cases du groupe sont déjà visibles et valent `held` :
 * poser `held` sur `index` rendrait alors le groupe uniforme, donc éliminé.
 */
function completes(grid: readonly ViewCell[], group: readonly number[], index: number, held: number) {
  if (!group.includes(index)) return false;
  return group.every((i) => i === index || faceValue(grid[i]) === held);
}

/** Ce qu'il advient de la grille si la carte `held` est posée sur la case `index`. */
export function placementHint(
  grid: readonly ViewCell[],
  index: number,
  held: number,
): PlacementHint | null {
  const cell = grid[index];
  // Une case vidée n'accueille plus rien.
  if (cell === undefined || cell === null) return null;

  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const clears = completes(grid, columnIndices(col), index, held)
    ? 'column'
    : completes(grid, rowIndices(row), index, held)
      ? 'row'
      : null;

  const replaced = faceValue(cell);
  if (replaced === null) {
    // Case cachée : on ignore ce qu'on jette, donc le solde reste indéterminé —
    // même quand le groupe saute, puisque la carte remplacée en faisait partie.
    return { delta: null, clears };
  }

  if (clears) {
    const size = clears === 'column' ? ROWS : COLS;
    // Tout le groupe disparaît : la carte remplacée et les `size - 1` autres,
    // qui valent `held` chacune puisque c'est ce qui rend le groupe uniforme.
    return { delta: -(replaced + held * (size - 1)), clears };
  }

  return { delta: held - replaced, clears: null };
}

/** Les indices sur lesquels poser `held` ferait sauter un groupe. */
export function clearingIndices(grid: readonly ViewCell[], held: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (placementHint(grid, i, held)?.clears) out.push(i);
  }
  return out;
}
