import {
  COLS,
  GRID_SIZE,
  JOKER_CARD,
  JOKER_VALUE,
  ROWS,
  STEAL_CARD,
  SWAP_CARD,
  isJokerCard,
  isStealCard,
  isSwapCard,
  type Cell,
  type GroupKind,
  type PileCard,
  type SpecialCard,
  type ValueCard,
  type Variant,
} from './types';

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

/**
 * Ce que le mode spicy ajoute au paquet : deux -5.
 *
 * Deux, et pas trois : à trois exemplaires une colonne de -5 devient possible,
 * ce qui cumulerait le plus gros gain de points du jeu et une élimination
 * gratuite. À deux, la carte reste du point sec — dix-sept points d'écart avec
 * un 12, et rien d'autre. Un seul exemplaire, lui, ne sortirait qu'une manche
 * sur quatre à deux joueurs : trop rare pour qu'on joue avec.
 */
export const SPICY_COMPOSITION: ReadonlyArray<readonly [value: number, count: number]> = [
  [-5, 2],
];

/**
 * Nombre de cartes Vol glissées dans la pioche en mode spicy.
 *
 * Quatre, parce qu'un Vol ne se déclenche qu'en étant *pioché* (cf.
 * `seedSpecialCards`) : ça fait environ un demi Vol par manche à deux joueurs et
 * un peu plus d'un à quatre. Deux cartes ne sortiraient quasiment jamais, huit
 * feraient de l'échange le jeu principal.
 */
export const STEAL_COUNT = 4;

/**
 * Nombre de cartes Valse glissées dans la pioche en mode spicy.
 *
 * Autant que de Vol, et pour la même arithmétique : une Valse ne se déclenche
 * qu'en étant *piochée*, ce qui en fait environ une par manche. Elle est aussi
 * la plus douce des deux — elle ne touche que sa propre grille — donc rien ne
 * justifiait de la rendre plus rare que sa jumelle.
 */
export const SWAP_COUNT = 4;

/**
 * Nombre de jokers du mode spicy.
 *
 * Un seul, et ce n'est pas qu'une question de dosage : à deux exemplaires, une
 * colonne `joker / joker / 7` poserait la question de ce qu'elle vaut, et deux
 * jokers côte à côte n'auraient plus rien à compléter. À un, la règle se dit en
 * une phrase.
 */
export const JOKER_COUNT = 1;

export const DECK_SIZE = 150;
export const SPICY_DECK_SIZE =
  DECK_SIZE + SPICY_COMPOSITION.reduce((n, [, c]) => n + c, 0) + JOKER_COUNT;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const INITIAL_FLIPS = 2;
export const DEFAULT_TARGET_SCORE = 100;

/** Les cartes à valeur du paquet : celles qui peuvent atterrir dans une grille. */
export function buildDeck(variant: Variant = 'classic'): ValueCard[] {
  const spicy = variant === 'spicy';
  const composition = spicy ? [...DECK_COMPOSITION, ...SPICY_COMPOSITION] : DECK_COMPOSITION;
  const deck: ValueCard[] = [];
  for (const [value, count] of composition) {
    for (let i = 0; i < count; i++) deck.push(value);
  }
  if (spicy) for (let i = 0; i < JOKER_COUNT; i++) deck.push(JOKER_CARD);
  return deck;
}

/**
 * Comment une carte se nomme dans une phrase.
 *
 * Les annonces du jeu interpolaient la valeur directement (« pose 4, jette
 * 12 ») : avec le joker, ça donnait « pose joker », et avec un Vol, un nom de
 * code anglais au milieu d'une phrase française.
 */
export function cardName(card: PileCard): string {
  if (isJokerCard(card)) return 'le joker';
  if (isStealCard(card)) return 'un Vol';
  if (isSwapCard(card)) return 'une Valse';
  return String(card);
}

/**
 * Les deux seules traductions entre une carte de pile et une case de grille.
 *
 * Tout le reste du moteur travaille sur des cases dont la valeur est un nombre
 * (cf. `Cell`) : ces deux fonctions sont la frontière, et le joker n'existe
 * comme carte à part qu'en dehors d'elles.
 */
export function cardToCell(card: ValueCard, faceUp = false): NonNullable<Cell> {
  return isJokerCard(card)
    ? { value: JOKER_VALUE, faceUp, joker: true }
    : { value: card, faceUp };
}

/**
 * La carte que contient cette case, telle qu'elle repart dans une pile.
 *
 * Le paramètre est volontairement structurel : une case de la vue (`ViewCell`)
 * porte les deux mêmes champs, et l'affichage a besoin exactement de cette
 * traduction pour dessiner un joker au lieu d'un 0.
 */
export function cellToCard(cell: { value: number; joker?: true }): ValueCard {
  return cell.joker ? JOKER_CARD : cell.value;
}

/**
 * Remplace la carte d'une case, sur place.
 *
 * Le drapeau de joker doit se *retirer* autant que se poser : une case qui
 * portait le joker et reçoit un 7 continuerait sinon à compléter les colonnes.
 * D'où ce passage obligé, plutôt qu'une affectation à la main de `value` à
 * chaque endroit où une case change de carte.
 */
export function setCellCard(cell: NonNullable<Cell>, card: ValueCard, faceUp = true): void {
  const next = cardToCell(card, faceUp);
  cell.value = next.value;
  cell.faceUp = next.faceUp;
  if (next.joker) cell.joker = true;
  else delete cell.joker;
}

/** Les cartes sans valeur que le mode spicy glisse dans la pioche. */
export function spicySpecials(): SpecialCard[] {
  return [
    ...Array.from({ length: STEAL_COUNT }, (): SpecialCard => STEAL_CARD),
    ...Array.from({ length: SWAP_COUNT }, (): SpecialCard => SWAP_CARD),
  ];
}

/**
 * Glisse les cartes sans valeur — Vol et Valse — dans la pioche, une fois les
 * grilles distribuées.
 *
 * Aucune des deux ne porte de valeur : elles n'ont donc pas de place dans une
 * grille, et c'est ce qui permet de les ajouter sans toucher au comptage ni aux
 * éliminations. La conséquence est une règle de jeu à part entière, pas un
 * détail d'implémentation — **elles ne se déclenchent que si quelqu'un
 * pioche**, jamais en étant distribuées. C'est ce qui fixe leur fréquence, et
 * donc leur dosage (cf. `STEAL_COUNT`, `SWAP_COUNT`).
 */
export function seedSpecialCards(
  pile: readonly ValueCard[],
  specials: readonly SpecialCard[],
  seed: number,
): { pile: PileCard[]; seed: number } {
  const { items, seed: next } = shuffle([...pile, ...specials], seed);
  return { pile: items, seed: next };
}

/**
 * Nombre de tours de table que le joker passe au minimum dans la pioche avant
 * de pouvoir en ressortir.
 *
 * « Quelque part dans la pioche » suffisait en théorie et pas en pratique :
 * tiré uniformément, le joker pouvait retomber sur le dessus, et il se
 * repiochait deux tours plus tard. Le hasard était honnête, ce qui se lisait à
 * table ne l'était pas — on venait de le rendre, l'adversaire l'avait. Une
 * carte rendue à la pioche doit d'abord disparaître.
 *
 * Trois tours de table, comptés en cartes piochées : un tour ne suffit pas à
 * faire oublier d'où la carte vient, et au-delà on ne fixe plus un délai, on
 * enterre la carte.
 */
export const JOKER_COOLDOWN_LAPS = 3;

/**
 * À combien de cartes du dessus de la pioche le joker doit rentrer.
 *
 * Le délai se compte en tours de table (cf. `JOKER_COOLDOWN_LAPS`) : un tour
 * consomme au plus une carte par joueur, donc `joueurs × tours` cartes
 * au-dessus de lui garantissent autant de tours avant qu'il ne puisse revenir.
 *
 * Plafonné à la moitié de la pioche, parce qu'une pioche courte — fin de
 * manche, table pleine — ferait de ce plancher un enfouissement, et le joker
 * doit rester tirable : il attend, il ne sort pas du jeu.
 */
export function jokerReturnDepth(pileLength: number, playerCount: number): number {
  return Math.min(playerCount * JOKER_COOLDOWN_LAPS, Math.floor(pileLength / 2));
}

/**
 * Remet une carte dans la pioche, à une position tirée au sort, avec au moins
 * `minDepth` cartes au-dessus d'elle.
 *
 * Sert au joker qui vient de fermer un groupe : posé sur la défausse, il se
 * ramassait au tour suivant par celui qui jouait après — la carte la plus forte
 * du paquet offerte à quelqu'un qui n'avait rien fait pour l'avoir, et souvent
 * au dernier joueur d'une manche qui se fermait. Rendu à la pioche, il reste en
 * jeu et peut revenir, mais il ne se sert plus : il se tire.
 *
 * N'importe où sous ces `minDepth` cartes, pas dessous : enfoui, il ne
 * ressortirait jamais d'une manche, ce qui reviendrait à le retirer du jeu.
 *
 * On pioche par le haut, donc par la fin du tableau : insérer à l'indice `i`
 * laisse `pile.length - i` cartes à tirer avant celle-ci.
 *
 * Mute `pile`. Renvoie la graine suivante.
 */
export function returnToDrawPile(
  pile: PileCard[],
  card: PileCard,
  seed: number,
  minDepth = 0,
): number {
  const { value, seed: next } = nextRandom(seed);
  const deepest = Math.max(0, pile.length - Math.max(0, minDepth));
  pile.splice(Math.floor(value * (deepest + 1)), 0, card);
  return next;
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
 *
 * Le joker, lui, compte dans le groupe sans rien imposer : il prend la valeur
 * des autres. Il en faut donc au moins une autre — un groupe qui ne serait fait
 * que de jokers n'aurait aucune valeur sur laquelle s'accorder, et « trois
 * cartes identiques » ne voudrait plus rien dire. C'est aussi pourquoi le
 * paquet n'en contient qu'un (cf. `JOKER_COUNT`).
 */
function uniformValue(grid: readonly Cell[], indices: readonly number[]): number | null {
  let value: number | null = null;
  let count = 0;
  let numbered = 0;
  for (const i of indices) {
    const cell = grid[i];
    if (cell === null) continue;
    if (!cell.faceUp) return null;
    count++;
    if (cell.joker) continue;
    if (numbered > 0 && cell.value !== value) return null;
    value = cell.value;
    numbered++;
  }
  return count >= MIN_GROUP && numbered > 0 ? value : null;
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
  /** Celles de ces cases qui portaient le joker. */
  jokers: number[];
}

export interface ClearOutcome {
  groups: ClearedGroup[];
  /**
   * Combien de jokers ces éliminations ont retirés de la grille.
   *
   * Ils ne sont pas partis à la défausse avec le reste du groupe : c'est à
   * l'appelant de les remettre en jeu (cf. `returnToDrawPile`). Un compte, et
   * pas les cases : une même case peut fermer une colonne *et* une ligne, et
   * ce qui se remet en jeu, c'est une carte, pas deux.
   */
  jokers: number;
}

/**
 * Élimine les groupes de cartes identiques face visible : les colonnes de trois
 * (règle officielle) et les lignes entièrement homogènes (règle maison). Les
 * cartes partent à la défausse et ne comptent plus.
 *
 * Au sein d'une même passe, les groupes sont d'abord repérés sur la grille
 * intacte, puis retirés d'un bloc : sinon, vider une ligne en premier
 * empêcherait une colonne qui la croise d'être reconnue.
 *
 * Puis on recommence, car une élimination peut en découvrir une autre : une
 * ligne de quatre dont une carte dépareille reste bloquée tant que cette carte
 * est là, mais si la colonne qui la porte s'en va, la ligne devient un groupe
 * de trois homogène (cf. `MIN_GROUP`) et doit partir à son tour. Chaque passe
 * retire au moins une carte, donc la boucle s'arrête.
 *
 * Le joker fait exception à la destination : il ne se pose pas sur la défausse,
 * il est rendu à l'appelant pour repartir dans la pioche (cf.
 * `returnToDrawPile`). C'est la seule carte du paquet qui vaut la peine d'être
 * ramassée, et sur la défausse le joueur suivant n'avait qu'à se servir.
 *
 * Mute `grid` et `discardPile`.
 */
export function clearGroups(grid: Cell[], discardPile: ValueCard[]): ClearOutcome {
  const groups: ClearedGroup[] = [];
  let jokers = 0;

  for (;;) {
    const found: ClearedGroup[] = [];

    const collect = (kind: GroupKind, index: number, indices: number[]) => {
      const value = uniformValue(grid, indices);
      if (value === null) return;
      const cells = indices.filter((i) => grid[i] !== null);
      found.push({ kind, index, value, cells, jokers: cells.filter((i) => grid[i]!.joker) });
    };

    for (let col = 0; col < COLS; col++) collect('column', col, columnIndices(col));
    for (let row = 0; row < ROWS; row++) collect('row', row, rowIndices(row));

    if (found.length === 0) return { groups, jokers };

    for (const i of new Set(found.flatMap((group) => group.cells))) {
      const card = cellToCard(grid[i]!);
      if (isJokerCard(card)) jokers++;
      else discardPile.push(card);
      grid[i] = null;
    }

    groups.push(...found);
  }
}
