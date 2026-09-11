import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import {
  DECK_COMPOSITION,
  DECK_SIZE,
  JOKER_COUNT,
  SPICY_COMPOSITION,
  SPICY_DECK_SIZE,
  STEAL_COUNT,
  buildDeck,
  cardToCell,
  columnIndices,
  gridSum,
  rowIndices,
  shuffle,
} from './rules';
import { legalActionsFor, toView } from './view';
import { GRID_SIZE, JOKER_CARD, STEAL_CARD } from './types';
import type { Action, Cell, GameState, PileCard, ValueCard } from './types';

// --- utilitaires de test ----------------------------------------------------

function play(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`${action.type}: ${res.error}`);
  return res.state;
}

function expectFail(state: GameState, action: Action): string {
  const res = applyAction(state, action);
  if (res.ok) throw new Error(`${action.type} aurait dû échouer`);
  return res.error;
}

function lobby(playerCount = 2, seed = 42): GameState {
  let s = createGame({
    id: 'g1',
    code: 'TEST',
    host: { id: 'p0', name: 'Hôte', emoji: '🐙' },
    seed,
    now: 0,
  });
  for (let i = 1; i < playerCount; i++) {
    s = play(s, { type: 'join', playerId: `p${i}`, name: `J${i}`, emoji: '🦊' });
  }
  return s;
}

/** Démarre une partie et fait retourner à chacun ses deux premières cartes. */
function started(playerCount = 2, seed = 42): GameState {
  let s = play(lobby(playerCount, seed), { type: 'startGame', playerId: 'p0' });
  for (const p of s.players) {
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 0 });
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 1 });
  }
  return s;
}

/** Force la grille d'un joueur. `values[i] === null` => case vide (colonne éliminée). */
function setGrid(s: GameState, playerId: string, values: Array<ValueCard | null>, faceUp = true) {
  const p = s.players.find((x) => x.id === playerId)!;
  p.grid = values.map<Cell>((v) => (v === null ? null : cardToCell(v, faceUp)));
}

/** Les cartes à valeur d'une pile : en mode classique, elles y sont toutes. */
function values(pile: readonly PileCard[]): ValueCard[] {
  return pile.filter((c): c is ValueCard => c !== STEAL_CARD);
}

/** Deux paquets contiennent-ils les mêmes cartes, ordre mis à part ? */
function sameCards(a: readonly PileCard[], b: readonly PileCard[]) {
  const key = (d: readonly PileCard[]) => d.map(String).sort().join(',');
  return key(a) === key(b);
}

/** Joue un tour « neutre » : prend la défausse et la place sur la case `index`. */
function neutralTurn(s: GameState, index: number): GameState {
  const id = s.players[s.currentPlayerIndex].id;
  s = play(s, { type: 'takeDiscard', playerId: id });
  return play(s, { type: 'placeCard', playerId: id, index });
}

// --- le jeu de cartes -------------------------------------------------------

describe('composition du jeu', () => {
  it('contient 150 cartes', () => {
    expect(buildDeck()).toHaveLength(DECK_SIZE);
  });

  it('respecte la répartition officielle -2×5, -1×10, 0×15, 1..12×10', () => {
    const deck = buildDeck();
    const counts = new Map<ValueCard, number>();
    for (const c of deck) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.get(-2)).toBe(5);
    expect(counts.get(-1)).toBe(10);
    expect(counts.get(0)).toBe(15);
    for (let v = 1; v <= 12; v++) expect(counts.get(v)).toBe(10);
    expect(DECK_COMPOSITION.reduce((n, [, c]) => n + c, 0)).toBe(DECK_SIZE);
  });

  it('mélange de façon déterministe sans perdre ni inventer de carte', () => {
    const a = shuffle(buildDeck(), 7).items;
    const b = shuffle(buildDeck(), 7).items;
    const c = shuffle(buildDeck(), 8).items;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(sameCards(a, buildDeck())).toBe(true);
  });
});

// --- salon et distribution --------------------------------------------------

describe('salon', () => {
  it('refuse de lancer une partie à un seul joueur', () => {
    expect(expectFail(lobby(1), { type: 'startGame', playerId: 'p0' })).toMatch(/2 joueurs/);
  });

  it('refuse qu’un invité lance la partie', () => {
    expect(expectFail(lobby(2), { type: 'startGame', playerId: 'p1' })).toMatch(/hôte/);
  });

  it('accepte jusqu’à 8 joueurs et refuse le 9e', () => {
    const s = lobby(8);
    expect(s.players).toHaveLength(8);
    expect(expectFail(s, { type: 'join', playerId: 'p8', name: 'X', emoji: '🐸' })).toMatch(
      /complète/,
    );
  });

  it('distribue 12 cartes face cachée par joueur et une carte en défausse', () => {
    const s = play(lobby(3), { type: 'startGame', playerId: 'p0' });
    expect(s.phase).toBe('initialFlip');
    for (const p of s.players) {
      expect(p.grid).toHaveLength(12);
      expect(p.grid.every((c) => c && !c.faceUp)).toBe(true);
    }
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile).toHaveLength(DECK_SIZE - 12 * 3 - 1);
  });
});

// --- retournement initial ---------------------------------------------------

describe('retournement initial', () => {
  it('limite chaque joueur à deux cartes', () => {
    let s = play(lobby(2), { type: 'startGame', playerId: 'p0' });
    s = play(s, { type: 'flipInitial', playerId: 'p0', index: 0 });
    s = play(s, { type: 'flipInitial', playerId: 'p0', index: 1 });
    expect(expectFail(s, { type: 'flipInitial', playerId: 'p0', index: 2 })).toMatch(/déjà/);
  });

  it('donne la main au joueur dont la somme des deux cartes est la plus haute', () => {
    let s = play(lobby(3), { type: 'startGame', playerId: 'p0' });
    setGrid(s, 'p0', [3, 4, ...Array<null>(10).fill(null)], false);
    setGrid(s, 'p1', [12, 11, ...Array<null>(10).fill(null)], false);
    setGrid(s, 'p2', [1, 0, ...Array<null>(10).fill(null)], false);
    for (const p of s.players) {
      s = play(s, { type: 'flipInitial', playerId: p.id, index: 0 });
      s = play(s, { type: 'flipInitial', playerId: p.id, index: 1 });
    }
    expect(s.phase).toBe('playing');
    expect(s.players[s.currentPlayerIndex].id).toBe('p1');
  });

  it('départage une égalité de somme par la plus grosse carte', () => {
    let s = play(lobby(2), { type: 'startGame', playerId: 'p0' });
    setGrid(s, 'p0', [5, 5, ...Array<null>(10).fill(null)], false);
    setGrid(s, 'p1', [9, 1, ...Array<null>(10).fill(null)], false);
    for (const p of s.players) {
      s = play(s, { type: 'flipInitial', playerId: p.id, index: 0 });
      s = play(s, { type: 'flipInitial', playerId: p.id, index: 1 });
    }
    expect(s.players[s.currentPlayerIndex].id).toBe('p1');
  });
});

// --- déroulement d'un tour --------------------------------------------------

describe('tour de jeu', () => {
  it('interdit de jouer hors de son tour', () => {
    const s = started(2);
    const other = s.players[(s.currentPlayerIndex + 1) % 2].id;
    expect(expectFail(s, { type: 'drawFromPile', playerId: other })).toMatch(/ton tour/);
  });

  it('pioche puis échange : la carte remplacée part à la défausse, face visible', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    const me = s.players.find((p) => p.id === id)!;
    const replaced = me.grid[5]!.value;
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'drawFromPile', playerId: id });
    const held = s.heldCard!;
    expect(s.turnStep).toBe('holding');

    s = play(s, { type: 'placeCard', playerId: id, index: 5 });
    const after = s.players.find((p) => p.id === id)!;
    expect(after.grid[5]).toEqual({ value: held, faceUp: true });
    expect(s.discardPile.at(-1)).toBe(replaced);
    expect(s.discardPile.length).toBe(discardBefore + 1);
    expect(s.players[s.currentPlayerIndex].id).not.toBe(id);
  });

  it('défausse la carte piochée puis oblige à retourner une carte cachée', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    s = play(s, { type: 'drawFromPile', playerId: id });
    const held = s.heldCard!;
    s = play(s, { type: 'discardHeld', playerId: id });

    expect(s.turnStep).toBe('mustFlip');
    expect(s.discardPile.at(-1)).toBe(held);
    expect(expectFail(s, { type: 'drawFromPile', playerId: id })).toMatch(/retourner/);
    // On ne peut pas « retourner » une carte déjà visible.
    expect(expectFail(s, { type: 'flipCard', playerId: id, index: 0 })).toMatch(/face cachée/);

    s = play(s, { type: 'flipCard', playerId: id, index: 7 });
    expect(s.players.find((p) => p.id === id)!.grid[7]!.faceUp).toBe(true);
    expect(s.players[s.currentPlayerIndex].id).not.toBe(id);
  });

  it('interdit de défausser une carte prise dans la défausse', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    s = play(s, { type: 'takeDiscard', playerId: id });
    expect(expectFail(s, { type: 'discardHeld', playerId: id })).toMatch(/défausse doit être placée/);
  });

  it('reconstitue la pioche à partir de la défausse quand elle est vide', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    s.discardPile = [...values(s.drawPile), ...s.discardPile];
    s.drawPile = [];
    const total = s.discardPile.length;

    s = play(s, { type: 'drawFromPile', playerId: id });
    expect(s.lastEvents.some((e) => e.type === 'pileReshuffled')).toBe(true);
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile.length + s.discardPile.length + 1).toBe(total);
  });
});

// --- éliminations -----------------------------------------------------------

/** Grille sans colonne ni ligne homogène : base neutre des scénarios. */
const CLEAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('élimination des colonnes (règle officielle)', () => {
  it('élimine une colonne de trois cartes identiques et la met à la défausse', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Colonne 1 = indices 1, 5, 9. Deux 8 en place, le 2 sera remplacé par un 8.
    setGrid(s, id, [1, 8, 3, 4, 5, 8, 7, 12, 9, 2, 11, 6]);
    s.discardPile.push(8);
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 9 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of columnIndices(1)) expect(grid[i]).toBeNull();
    // -1 (carte prise) +1 (le 2 remplacé) +3 (colonne éliminée)
    expect(s.discardPile.length).toBe(discardBefore + 3);
    expect(s.lastEvents).toContainEqual({
      type: 'groupCleared',
      playerId: id,
      kind: 'column',
      index: 1,
      value: 8,
      cells: columnIndices(1),
      jokers: [],
    });
  });

  it('fonctionne aussi pour une colonne de -2', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [-2, 1, 2, 3, -2, 4, 5, 6, 7, 8, 9, 10]);
    s.discardPile.push(-2);
    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 8 });
    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of columnIndices(0)) expect(grid[i]).toBeNull();
  });

  it('n’élimine pas une colonne dont une carte est encore cachée', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [8, 1, 2, 3, 8, 4, 5, 6, 8, 9, 10, 11]);
    s.players.find((x) => x.id === id)!.grid[8] = { value: 8, faceUp: false };

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 3 });
    expect(s.players.find((x) => x.id === id)!.grid[0]).not.toBeNull();
  });
});

// --- lignes (règle maison) --------------------------------------------------

describe('élimination des lignes (règle maison)', () => {
  it('élimine une ligne de quatre cartes identiques', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Ligne 1 = indices 4 à 7 : trois 6 en place, le 9 sera remplacé par un 6.
    setGrid(s, id, [1, 2, 3, 4, 6, 6, 6, 9, 10, 11, 12, 5]);
    s.discardPile.push(6);
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 7 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of rowIndices(1)) expect(grid[i]).toBeNull();
    // -1 (carte prise) +1 (le 9 remplacé) +4 (la ligne)
    expect(s.discardPile.length).toBe(discardBefore + 4);
    expect(s.lastEvents).toContainEqual({
      type: 'groupCleared',
      playerId: id,
      kind: 'row',
      index: 1,
      value: 6,
      cells: rowIndices(1),
      jokers: [],
    });
  });

  it('laisse tranquilles trois cartes identiques côte à côte dans une ligne', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [1, 2, 3, 4, 6, 6, 6, 9, 10, 11, 12, 5]);
    s.discardPile.push(7);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 0 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of rowIndices(1)) expect(grid[i]).not.toBeNull();
    expect(s.lastEvents.some((e) => e.type === 'groupCleared')).toBe(false);
  });

  it('élimine une ligne de trois quand une colonne éliminée l’a raccourcie', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // La colonne 2 est déjà partie : la ligne 2 n'a plus que trois cases
    // (8, 9 et 11), dont deux portent déjà un 1.
    setGrid(s, id, [3, 4, null, 5, 6, 7, null, 8, 1, 1, null, 9]);
    s.discardPile.push(1);
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 11 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of rowIndices(2)) expect(grid[i]).toBeNull();
    // -1 (carte prise) +1 (le 9 remplacé) +3 (la ligne : le trou ne part pas deux fois)
    expect(s.discardPile.length).toBe(discardBefore + 3);
    expect(s.lastEvents).toContainEqual({
      type: 'groupCleared',
      playerId: id,
      kind: 'row',
      index: 2,
      value: 1,
      cells: [8, 9, 11],
      jokers: [],
    });
  });

  it('n’élimine pas une ligne réduite à deux cartes identiques', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Deux colonnes déjà parties : il ne reste que deux cases sur la ligne 2.
    setGrid(s, id, [3, null, null, 4, 5, null, null, 6, 1, null, null, 7]);
    s.discardPile.push(1);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 11 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    expect(grid[8]).not.toBeNull();
    expect(grid[11]).not.toBeNull();
    expect(s.lastEvents.some((e) => e.type === 'groupCleared')).toBe(false);
  });

  it('élimine la ligne libérée par la colonne qui vient de partir', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // La ligne 0 est trois 4 plus un 0 qui dépareille. Compléter la colonne 3
    // en 0 la fait partir, et la ligne 0 devient alors un groupe homogène.
    setGrid(s, id, [4, 4, 4, 0, 1, 2, 3, 0, 5, 6, 7, 9]);
    s.discardPile.push(0);
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 11 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of [...columnIndices(3), ...rowIndices(0)]) expect(grid[i]).toBeNull();
    // -1 (carte prise) +1 (le 9 remplacé) +3 (la colonne) +3 (la ligne raccourcie)
    expect(s.discardPile.length).toBe(discardBefore + 6);
    const cleared = s.lastEvents.filter((e) => e.type === 'groupCleared');
    expect(cleared).toHaveLength(2);
    expect(cleared[0]).toMatchObject({ kind: 'column', index: 3, value: 0, cells: [3, 7, 11] });
    expect(cleared[1]).toMatchObject({ kind: 'row', index: 0, value: 4, cells: [0, 1, 2] });
  });

  it('vide d’un seul coup la colonne et la ligne qui se croisent', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    // L'index 8 est à l'intersection de la colonne 0 et de la ligne 2.
    setGrid(s, id, [5, 1, 2, 3, 5, 4, 6, 7, 9, 5, 5, 5]);
    s.discardPile.push(5);
    const discardBefore = s.discardPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 8 });

    const grid = s.players.find((p) => p.id === id)!.grid;
    for (const i of [...columnIndices(0), ...rowIndices(2)]) expect(grid[i]).toBeNull();
    // Six cases distinctes retirées, la case commune n'étant comptée qu'une fois.
    expect(s.discardPile.length).toBe(discardBefore + 6);
    expect(s.lastEvents.filter((e) => e.type === 'groupCleared')).toHaveLength(2);
  });

  it('retire aussi une ligne révélée au dévoilement final', () => {
    let s = started(2);
    s.targetScore = 1000;
    s.currentPlayerIndex = 0;
    s.turnStep = 'choose';
    setGrid(s, 'p0', CLEAN);
    s.players[0].grid[11] = { value: 12, faceUp: false };
    // p0 garde tout caché de son côté ; p1 cache une ligne de quatre 9.
    setGrid(s, 'p1', [1, 2, 3, 4, 9, 9, 9, 9, 10, 11, 12, 5], false);

    s = play(s, { type: 'drawFromPile', playerId: 'p0' });
    s = play(s, { type: 'discardHeld', playerId: 'p0' });
    s = play(s, { type: 'flipCard', playerId: 'p0', index: 11 });
    s = neutralTurn(s, 0); // dernier tour de p1, sur une case hors de la ligne 1

    expect(s.phase).toBe('roundOver');
    for (const i of rowIndices(1)) expect(s.players[1].grid[i]).toBeNull();
  });
});

// --- fin de manche ----------------------------------------------------------

describe('fin de manche', () => {
  it('laisse exactement un tour à chaque adversaire après la fermeture', () => {
    let s = started(3);
    s.targetScore = 1000; // on veut observer la fin de manche, pas la fin de partie
    s.currentPlayerIndex = 0;
    s.turnStep = 'choose';
    for (const id of ['p0', 'p1', 'p2']) setGrid(s, id, CLEAN);
    s.players[0].grid[11] = { value: 12, faceUp: false };

    s = play(s, { type: 'drawFromPile', playerId: 'p0' });
    s = play(s, { type: 'discardHeld', playerId: 'p0' });
    s = play(s, { type: 'flipCard', playerId: 'p0', index: 11 });

    expect(s.roundCloserId).toBe('p0');
    expect(s.finalTurnsLeft).toBe(2);
    expect(s.players[s.currentPlayerIndex].id).toBe('p1');

    s = neutralTurn(s, 3);
    expect(s.phase).toBe('playing');
    expect(s.players[s.currentPlayerIndex].id).toBe('p2');

    s = neutralTurn(s, 3);
    expect(s.phase).toBe('roundOver');
    expect(s.lastRoundScores).not.toBeNull();
  });

  it('révèle tout et applique la règle des colonnes une dernière fois', () => {
    let s = started(2);
    s.targetScore = 1000;
    s.currentPlayerIndex = 0;
    s.turnStep = 'choose';
    setGrid(s, 'p0', CLEAN);
    s.players[0].grid[11] = { value: 12, faceUp: false };
    // p1 garde tout caché : la colonne 0 de 7 n'apparaîtra qu'au dévoilement final.
    setGrid(s, 'p1', [7, 1, 2, 3, 7, 4, 5, 6, 7, 8, 9, 10], false);

    s = play(s, { type: 'drawFromPile', playerId: 'p0' });
    s = play(s, { type: 'discardHeld', playerId: 'p0' });
    s = play(s, { type: 'flipCard', playerId: 'p0', index: 11 });
    s = neutralTurn(s, 11);

    expect(s.phase).toBe('roundOver');
    for (const i of columnIndices(0)) expect(s.players[1].grid[i]).toBeNull();
  });
});

// --- comptage ---------------------------------------------------------------

// Grilles écrites ligne par ligne (3 lignes × 4 colonnes), sans aucune colonne
// ni ligne homogène : rien ne doit s'éliminer, le total reste celui annoncé.
const LOW = [0, 0, 0, 1, 0, 0, 1, 0, 2, 3, 0, 0]; // total 7
const HIGH = [11, 12, 12, 12, 12, 11, 12, 12, 12, 12, 11, 10]; // total 139
const MID = [1, 1, 1, 2, 1, 1, 2, 1, 2, 3, 1, 1]; // total 17
const NEG_HIGH = [-1, -1, -1, 0, -1, -1, 0, -1, 0, -2, -1, -1]; // total -10
const NEG_LOW = [-1, -2, -2, -2, -2, -1, -2, -2, -2, -2, -1, 0]; // total -19

describe('comptage des points', () => {
  /**
   * Force une fin de manche fermée par p0 avec des grilles imposées.
   * Le dernier tour de p1 est rendu neutre : on truque la pioche pour que la
   * carte qui lui revient soit exactement celle qu'il remplace.
   */
  function scoreRound(p0: number[], p1: number[], targetScore = 100) {
    let s = started(2, 1);
    s.targetScore = targetScore;
    s.currentPlayerIndex = 0;
    s.turnStep = 'choose';
    setGrid(s, 'p0', p0);
    s.players[0].grid[11] = { value: p0[11], faceUp: false };
    setGrid(s, 'p1', p1);
    s.drawPile.push(p1[0]);

    s = play(s, { type: 'drawFromPile', playerId: 'p0' });
    s = play(s, { type: 'discardHeld', playerId: 'p0' });
    s = play(s, { type: 'flipCard', playerId: 'p0', index: 11 });
    s = neutralTurn(s, 0); // dernier tour de p1, sans effet sur son total
    return s;
  }

  it('additionne simplement les cartes restantes', () => {
    const s = scoreRound(CLEAN, LOW);
    const scores = s.lastRoundScores!;
    expect(scores[0].raw).toBe(78); // 1+2+…+12
    expect(scores[1].raw).toBe(7);
    expect(scores[0].closedRound).toBe(true);
    expect(scores[1].closedRound).toBe(false);
  });

  it('double le score du fermeur qui n’a pas le total le plus bas', () => {
    const s = scoreRound(HIGH, LOW);
    const [a, b] = s.lastRoundScores!;
    expect(a.raw).toBe(139);
    expect(a.doubled).toBe(true);
    expect(a.final).toBe(278);
    expect(b.doubled).toBe(false);
    expect(b.final).toBe(7);
  });

  it('double aussi en cas d’égalité : il faut être strictement le plus bas', () => {
    const s = scoreRound(MID, MID);
    const [a, b] = s.lastRoundScores!;
    expect(a.raw).toBe(b.raw);
    expect(a.doubled).toBe(true);
    expect(a.final).toBe(34);
    expect(b.doubled).toBe(false);
    expect(b.final).toBe(17);
  });

  it('ne double pas le fermeur quand il est seul le plus bas', () => {
    const s = scoreRound(LOW, HIGH);
    const [a] = s.lastRoundScores!;
    expect(a.raw).toBe(7);
    expect(a.doubled).toBe(false);
    expect(a.final).toBe(7);
  });

  it('ne double jamais un total négatif ou nul', () => {
    const s = scoreRound(NEG_HIGH, NEG_LOW);
    const [a, b] = s.lastRoundScores!;
    expect(a.raw).toBe(-10);
    expect(b.raw).toBe(-19);
    expect(b.raw).toBeLessThan(a.raw); // le fermeur n'est pas le plus bas…
    expect(a.doubled).toBe(false); // …mais son total est négatif : pas de pénalité
    expect(a.final).toBe(-10);
  });

  it('cumule les manches et termine la partie à 100 points, le plus bas gagne', () => {
    const s = scoreRound(HIGH, LOW, 100);
    expect(s.phase).toBe('gameOver');
    expect(s.players[0].totalScore).toBe(278);
    expect(s.players[1].totalScore).toBe(7);
    expect(s.winnerId).toBe('p1');
  });

  it('ne termine pas la partie tant que personne n’atteint le seuil', () => {
    const s = scoreRound(LOW, MID, 100);
    expect(s.phase).toBe('roundOver');
    expect(s.winnerId).toBeNull();
    expect(s.players[0].roundScores).toEqual([7]);
  });

  it('enchaîne sur une nouvelle manche en gardant les scores cumulés', () => {
    let s = scoreRound(LOW, MID, 100);
    const totals = s.players.map((p) => p.totalScore);
    s = play(s, { type: 'nextRound', playerId: 'p0' });
    expect(s.phase).toBe('initialFlip');
    expect(s.round).toBe(2);
    expect(s.players.map((p) => p.totalScore)).toEqual(totals);
    expect(s.players.every((p) => p.grid.every((c) => c && !c.faceUp))).toBe(true);
  });
});

// --- confidentialité --------------------------------------------------------

describe('projection client', () => {
  it('ne laisse jamais fuiter la valeur d’une carte face cachée ni la pioche', () => {
    const s = started(2);
    const view = toView(s, 'p1');
    const serialized = JSON.stringify(view);

    expect(view.drawPileCount).toBe(s.drawPile.length);
    expect('drawPile' in (view as object)).toBe(false);
    for (const p of view.players) {
      for (const cell of p.grid) {
        if (cell && cell.faceUp === false) expect(Object.keys(cell)).toEqual(['faceUp']);
      }
    }
    expect(serialized).not.toContain('"drawPile"');
  });

  it('montre à tous la carte piochée (règle maison)', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = s.players[(s.currentPlayerIndex + 1) % 2].id;
    s = play(s, { type: 'drawFromPile', playerId: id });

    // Écart assumé avec le jeu de société : à distance, une carte grise au
    // milieu de la table ne raconte rien de ce que l'adversaire est en train
    // de peser. Ce qui reste secret, c'est le reste de la pioche.
    expect(toView(s, id).heldCard).toBe(s.heldCard);
    expect(toView(s, other).heldCard).toBe(s.heldCard);
    expect(toView(s, other).heldFrom).toBe('draw');
  });

  it('montre à tous la carte prise dans la défausse', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = s.players[(s.currentPlayerIndex + 1) % 2].id;
    const top = s.discardPile.at(-1)!;
    s = play(s, { type: 'takeDiscard', playerId: id });

    // Elle était face visible sur la table : la cacher serait retirer au jeu
    // une information que tout le monde avait déjà.
    expect(toView(s, id).heldCard).toBe(top);
    expect(toView(s, other).heldCard).toBe(top);
    expect(toView(s, other).heldFrom).toBe('discard');
  });

  it('annonce les actions légales du moment', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = s.players[(s.currentPlayerIndex + 1) % 2].id;

    expect(toView(s, id).legalActions).toEqual(['drawFromPile', 'takeDiscard']);
    expect(toView(s, other).legalActions).toEqual([]);

    s = play(s, { type: 'takeDiscard', playerId: id });
    expect(toView(s, id).legalActions).toEqual(['placeCard']);
  });
});

// --- pureté -----------------------------------------------------------------

describe('réducteur', () => {
  it('ne mute jamais l’état d’entrée et incrémente la version', () => {
    const s = started(2);
    const snapshot = JSON.stringify(s);
    const id = s.players[s.currentPlayerIndex].id;
    const next = play(s, { type: 'drawFromPile', playerId: id });
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(next.version).toBe(s.version + 1);
  });
});

// ===========================================================================
// Mode spicy
// ===========================================================================

/** Un salon en mode spicy, prêt à être lancé. */
function spicyLobby(playerCount = 2, seed = 42): GameState {
  return play(lobby(playerCount, seed), {
    type: 'setVariant',
    playerId: 'p0',
    variant: 'spicy',
  });
}

/** Une partie spicy lancée, chacun ayant retourné ses deux cartes. */
function startedSpicy(playerCount = 2, seed = 42): GameState {
  let s = play(spicyLobby(playerCount, seed), { type: 'startGame', playerId: 'p0' });
  for (const p of s.players) {
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 0 });
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 1 });
  }
  return s;
}

/**
 * Fixe la grille d'un joueur, une case laissée cachée.
 *
 * Sans cette case, la moindre grille de test est « entièrement révélée » : le
 * tour suivant fermerait la manche, et les assertions porteraient sur une fin
 * de manche au lieu du coup qu'on voulait vérifier.
 */
function setGridWithHidden(
  s: GameState,
  playerId: string,
  cards: Array<ValueCard | null>,
  hidden = 11,
) {
  setGrid(s, playerId, cards);
  s.players.find((p) => p.id === playerId)!.grid[hidden]!.faceUp = false;
}

/** Compte les exemplaires d'une carte dans une pile. */
const countCard = (pile: readonly PileCard[], card: PileCard) =>
  pile.filter((c) => c === card).length;

const gridOf = (s: GameState, playerId: string) => s.players.find((p) => p.id === playerId)!.grid;

/** Le joueur qui n'est pas `playerId`. */
const opponentOf = (s: GameState, playerId: string) => s.players.find((p) => p.id !== playerId)!.id;

describe('composition du mode spicy', () => {
  it('ajoute deux -5 et un joker au paquet officiel', () => {
    const deck = buildDeck('spicy');
    expect(deck).toHaveLength(SPICY_DECK_SIZE);
    expect(countCard(deck, -5)).toBe(2);
    expect(countCard(deck, JOKER_CARD)).toBe(JOKER_COUNT);
    expect(SPICY_COMPOSITION.reduce((n, [, c]) => n + c, 0) + JOKER_COUNT).toBe(
      SPICY_DECK_SIZE - DECK_SIZE,
    );
  });

  it('ne touche pas au paquet classique', () => {
    const deck = buildDeck();
    expect(countCard(deck, -5)).toBe(0);
    expect(countCard(deck, JOKER_CARD)).toBe(0);
  });

  it('ne met les Vol que dans la pioche, jamais dans une grille ni à la défausse', () => {
    const s = play(spicyLobby(4), { type: 'startGame', playerId: 'p0' });
    expect(countCard(s.drawPile, STEAL_CARD)).toBe(STEAL_COUNT);
    expect(countCard(s.discardPile, STEAL_CARD)).toBe(0);
    // Une grille ne peut pas porter un Vol : une case n'a qu'une valeur.
    for (const p of s.players) expect(p.grid.every((c) => c !== null)).toBe(true);
    // Toutes les autres cartes sont là, Vol compris : rien ne s'est perdu.
    expect(s.drawPile.length + s.discardPile.length + 12 * 4).toBe(
      SPICY_DECK_SIZE + STEAL_COUNT,
    );
  });

  it('garde les deux -5 comme des points secs — jamais une colonne', () => {
    // Deux exemplaires : il en faudrait trois pour éliminer une colonne.
    expect(countCard(buildDeck('spicy'), -5)).toBeLessThan(3);
    const s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [-5, 1, 2, 3, -5, 4, 5, 6, 7, 8, 9, 10]);
    expect(gridSum(gridOf(s, id))).toBe(45);
  });
});

describe('le choix du mode', () => {
  it('n’appartient qu’à l’hôte', () => {
    const s = lobby(2);
    expect(expectFail(s, { type: 'setVariant', playerId: 'p1', variant: 'spicy' })).toMatch(
      /hôte/,
    );
  });

  it('ne change plus rien une fois la partie lancée', () => {
    const s = play(spicyLobby(2), { type: 'startGame', playerId: 'p0' });
    expect(expectFail(s, { type: 'setVariant', playerId: 'p0', variant: 'classic' })).toMatch(
      /déjà commencé/,
    );
  });

  it('se rabat sur le classique pour une partie enregistrée avant le mode spicy', () => {
    const s = lobby(2);
    // Ces parties existent en base sans le champ : leur distribution ne doit pas
    // se mettre à contenir des cartes que personne n'a demandées.
    delete (s as Partial<GameState>).variant;
    const dealt = play(s, { type: 'startGame', playerId: 'p0' });
    expect(countCard(dealt.drawPile, STEAL_CARD)).toBe(0);
    expect(countCard(dealt.drawPile, JOKER_CARD)).toBe(0);
  });
});

describe('la carte Vol', () => {
  /** Amène le joueur actif à piocher un Vol, la pioche restant fournie. */
  function drawSteal(s: GameState, playerId: string): GameState {
    s.drawPile = [1, 2, STEAL_CARD];
    return play(s, { type: 'drawFromPile', playerId });
  }

  it('ne se tient pas en main et ne part pas à la défausse', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const discardBefore = [...s.discardPile];

    s = drawSteal(s, id);
    expect(s.turnStep).toBe('stealing');
    expect(s.heldCard).toBeNull();
    expect(s.heldFrom).toBeNull();
    expect(s.discardPile).toEqual(discardBefore);
    expect(s.lastEvents).toContainEqual({ type: 'stealDrawn', playerId: id });
    // Elle quitte la manche : elle n'est ni en main, ni en grille, ni en pile.
    expect(countCard(s.drawPile, STEAL_CARD)).toBe(0);
  });

  it('échange deux cartes visibles, sans toucher aux dos de part et d’autre', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGridWithHidden(s, id, [...CLEAN]);
    setGridWithHidden(s, other, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const hiddenBefore = gridOf(s, other).filter((c) => c && !c.faceUp).length;

    s = drawSteal(s, id);
    s = play(s, { type: 'steal', playerId: id, index: 0, targetPlayerId: other, targetIndex: 0 });

    expect(gridOf(s, id)[0]).toEqual({ value: 12, faceUp: true });
    expect(gridOf(s, other)[0]).toEqual({ value: 1, faceUp: true });
    expect(gridOf(s, other).filter((c) => c && !c.faceUp).length).toBe(hiddenBefore);
    expect(s.lastEvents).toContainEqual({
      type: 'stole',
      playerId: id,
      index: 0,
      taken: 12,
      targetPlayerId: other,
      targetIndex: 0,
      given: 1,
    });
    // Le tour est joué : on passe à l'adversaire.
    expect(s.players[s.currentPlayerIndex].id).toBe(other);
  });

  it('échange aussi deux dos, qui restent cachés et muets', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGridWithHidden(s, id, [...CLEAN]);
    setGridWithHidden(s, other, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    s = drawSteal(s, id);

    s = play(s, { type: 'steal', playerId: id, index: 11, targetPlayerId: other, targetIndex: 11 });

    // Les deux cartes ont changé de grille sans se retourner.
    expect(gridOf(s, id)[11]).toEqual({ value: 1, faceUp: false });
    expect(gridOf(s, other)[11]).toEqual({ value: 12, faceUp: false });
    // Et l'événement, qui part à tous les écrans, n'en dit rien : personne ne
    // sait ce qui vient de traverser la table, pas même le voleur.
    expect(s.lastEvents).toContainEqual({
      type: 'stole',
      playerId: id,
      index: 11,
      taken: null,
      targetPlayerId: other,
      targetIndex: 11,
      given: null,
    });
  });

  it('fait voyager la face avec la carte, et déplace donc les dos', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGridWithHidden(s, id, [...CLEAN]);
    setGridWithHidden(s, other, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const myHidden = gridOf(s, id).filter((c) => c && !c.faceUp).length;
    s = drawSteal(s, id);

    // Ma carte cachée (11) contre son 12 visible (0).
    s = play(s, { type: 'steal', playerId: id, index: 11, targetPlayerId: other, targetIndex: 0 });

    // Une carte visible arrive visible : j'ai un dos de moins, elle en a un de plus.
    expect(gridOf(s, id)[11]).toEqual({ value: 12, faceUp: true });
    expect(gridOf(s, other)[0]).toEqual({ value: 12, faceUp: false });
    expect(gridOf(s, id).filter((c) => c && !c.faceUp).length).toBe(myHidden - 1);
    // L'annonce ne dit que ce que la table montrait : sa carte était visible,
    // la mienne ne l'était pas.
    expect(s.lastEvents).toContainEqual({
      type: 'stole',
      playerId: id,
      index: 11,
      taken: 12,
      targetPlayerId: other,
      targetIndex: 0,
      given: null,
    });
  });

  it('ferme la manche quand le voleur donne son dernier dos', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGridWithHidden(s, id, [...CLEAN]);
    setGridWithHidden(s, other, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    s = drawSteal(s, id);

    s = play(s, { type: 'steal', playerId: id, index: 11, targetPlayerId: other, targetIndex: 0 });

    // Plus un seul dos chez moi : l'échange ferme la manche comme l'aurait fait
    // n'importe quel autre coup.
    expect(s.roundCloserId).toBe(id);
  });

  it('refuse de se voler soi-même et de viser un inconnu', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGridWithHidden(s, id, [...CLEAN]);
    s = drawSteal(s, id);

    expect(
      expectFail(s, { type: 'steal', playerId: id, index: 0, targetPlayerId: id, targetIndex: 1 }),
    ).toMatch(/adversaire/);
    expect(
      expectFail(s, { type: 'steal', playerId: id, index: 0, targetPlayerId: 'fantôme', targetIndex: 1 }),
    ).toMatch(/inconnu/);
  });

  it('peut fermer la colonne du voleur', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    // Colonne 0 = 0, 4, 8 : deux 8 en place, le 9 part contre le 8 d'en face.
    setGridWithHidden(s, id, [8, 1, 2, 3, 8, 4, 5, 6, 9, 10, 12, 7]);
    setGridWithHidden(s, other, [8, 1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 11]);
    s = drawSteal(s, id);

    s = play(s, { type: 'steal', playerId: id, index: 8, targetPlayerId: other, targetIndex: 0 });

    for (const i of columnIndices(0)) expect(gridOf(s, id)[i]).toBeNull();
    expect(gridOf(s, other)[0]).toEqual({ value: 9, faceUp: true });
  });

  it('peut offrir sans le vouloir la colonne de sa victime', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    // J'ai un 5 et je le donne ; sa colonne 0 en attendait précisément un.
    setGridWithHidden(s, id, [5, 1, 2, 3, 6, 7, 8, 10, 11, 12, 4, 9]);
    setGridWithHidden(s, other, [5, 1, 2, 3, 5, 4, 6, 7, 9, 10, 12, 8]);
    s = drawSteal(s, id);

    s = play(s, { type: 'steal', playerId: id, index: 0, targetPlayerId: other, targetIndex: 8 });

    for (const i of columnIndices(0)) expect(gridOf(s, other)[i]).toBeNull();
    expect(gridOf(s, id)[0]).toEqual({ value: 9, faceUp: true });
  });

  it('se refuse au prix d’un retournement', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGridWithHidden(s, id, [...CLEAN]);
    s = drawSteal(s, id);

    s = play(s, { type: 'declineSteal', playerId: id });
    expect(s.turnStep).toBe('mustFlip');
    expect(s.players[s.currentPlayerIndex].id).toBe(id);
    expect(s.lastEvents).toContainEqual({ type: 'stealDeclined', playerId: id });

    s = play(s, { type: 'flipCard', playerId: id, index: 11 });
    expect(s.players[s.currentPlayerIndex].id).not.toBe(id);
  });

  it('se refuse gratuitement quand il ne reste rien à retourner', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGrid(s, id, [...CLEAN]);
    setGridWithHidden(s, other, [...CLEAN]);
    s = drawSteal(s, id);

    s = play(s, { type: 'declineSteal', playerId: id });
    // Plus rien à retourner : le tour s'arrête, et la grille entière visible
    // ferme la manche comme n'importe quel autre coup l'aurait fait.
    expect(s.turnStep).not.toBe('mustFlip');
    expect(s.roundCloserId).toBe(id);
  });

  it('ne propose plus l’échange quand une grille n’a plus une seule carte', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = opponentOf(s, id);
    setGridWithHidden(s, id, [...CLEAN]);
    // Tout est parti en éliminations : il n'y a plus rien à échanger, dos
    // compris.
    setGrid(s, other, Array.from({ length: GRID_SIZE }, () => null));
    s = drawSteal(s, id);

    expect(legalActionsFor(s, id)).toEqual(['declineSteal']);
    expect(
      expectFail(s, { type: 'steal', playerId: id, index: 0, targetPlayerId: other, targetIndex: 0 }),
    ).toMatch(/Case invalide/);
  });
});

describe('le joker', () => {
  it('ne compte aucun point', () => {
    const s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [JOKER_CARD, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(gridSum(gridOf(s, id))).toBe(66);
  });

  it('s’annonce comme un joker dans la vue, pas comme un 0', () => {
    const s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [JOKER_CARD, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const cell = toView(s, id).players.find((p) => p.id === id)!.grid[0];
    expect(cell).toEqual({ faceUp: true, value: 0, joker: true });
  });

  it('complète une colonne de deux cartes identiques', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Colonne 1 = 1, 5, 9 : un 7, le joker, et un 7 qui arrive de la défausse.
    setGrid(s, id, [1, 7, 4, 6, 2, JOKER_CARD, 5, 10, 3, 9, 11, 8]);
    s.discardPile.push(7);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 9 });

    for (const i of columnIndices(1)) expect(gridOf(s, id)[i]).toBeNull();
    expect(s.lastEvents).toContainEqual({
      type: 'groupCleared',
      playerId: id,
      kind: 'column',
      index: 1,
      value: 7,
      cells: columnIndices(1),
      jokers: [5],
    });
    // Il ne se pose pas sur la défausse, où le joueur suivant n'aurait qu'à se
    // servir : il retourne dans la pioche.
    expect(countCard(s.discardPile, JOKER_CARD)).toBe(0);
    expect(countCard(s.drawPile, JOKER_CARD)).toBe(1);
  });

  it('rentre dans la pioche, pas sur la défausse, quand il ferme un groupe', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [1, 7, 4, 6, 2, JOKER_CARD, 5, 10, 3, 9, 11, 8]);
    s.discardPile.push(7);
    const pileBefore = s.drawPile.length;

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 9 });

    // Le joueur suivant ne peut pas le ramasser : ce n'est pas lui qui est sur
    // le dessus de la défausse, et la pioche a une carte de plus.
    expect(s.discardPile.at(-1)).not.toBe(JOKER_CARD);
    expect(s.drawPile).toHaveLength(pileBefore + 1);
    // Mélangé dedans, pas enfoui dessous : il peut ressortir dans la manche.
    expect(countCard(s.drawPile, JOKER_CARD)).toBe(1);
  });

  it('repart à la défausse comme les autres quand on le recouvre', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGridWithHidden(s, id, [JOKER_CARD, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
    s.discardPile.push(2);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 0 });

    // Poser dessus est un choix, pas une élimination : là, le joker se ramasse.
    expect(s.discardPile.at(-1)).toBe(JOKER_CARD);
  });

  it('ne complète pas une colonne dépareillée', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [1, 7, 4, 6, 2, JOKER_CARD, 5, 10, 3, 9, 11, 12]);
    s.discardPile.push(8);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 9 });

    for (const i of columnIndices(1)) expect(gridOf(s, id)[i]).not.toBeNull();
  });

  it('ne suffit pas à lui seul : un groupe de jokers n’a aucune valeur', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Trois jokers ne sont pas « trois cartes identiques » : ils n'ont rien à
    // compléter. Le paquet n'en contient qu'un, mais la règle doit être écrite.
    setGrid(s, id, [JOKER_CARD, 1, 2, 3, JOKER_CARD, 5, 6, 7, JOKER_CARD, 9, 10, 4]);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 11 });

    for (const i of columnIndices(0)) expect(gridOf(s, id)[i]).not.toBeNull();
  });

  it('perd son pouvoir dès qu’on le recouvre', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    setGrid(s, id, [1, 7, 4, 6, 2, JOKER_CARD, 5, 10, 3, 7, 11, 8]);
    s.discardPile.push(9);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 5 });

    // La case ne complète plus rien : la colonne de deux 7 reste en place.
    expect(gridOf(s, id)[5]).toEqual({ value: 9, faceUp: true });
    for (const i of columnIndices(1)) expect(gridOf(s, id)[i]).not.toBeNull();
    expect(countCard(s.discardPile, JOKER_CARD)).toBe(1);
  });

  it('peut fermer une colonne et une ligne du même coup', () => {
    let s = startedSpicy(2);
    const id = s.players[s.currentPlayerIndex].id;
    // Le joker en 5 est à l'intersection : colonne 1 de 7, ligne 1 de 3.
    setGrid(s, id, [1, 7, 4, 6, 3, JOKER_CARD, 3, 10, 2, 7, 5, 8]);
    s.discardPile.push(3);

    s = play(s, { type: 'takeDiscard', playerId: id });
    s = play(s, { type: 'placeCard', playerId: id, index: 7 });

    const grid = gridOf(s, id);
    for (const i of [...columnIndices(1), ...rowIndices(1)]) expect(grid[i]).toBeNull();
    const groups = s.lastEvents.filter((e) => e.type === 'groupCleared');
    expect(groups).toHaveLength(2);
    // Le joker est signalé dans les deux : c'est lui qui a fermé l'une et l'autre.
    for (const g of groups) expect(g).toMatchObject({ jokers: [5] });
    // Une case n'a beau fermer qu'un seul joker, elle appartient aux deux
    // groupes : c'est une carte qui rentre dans la pioche, pas deux.
    expect(countCard(s.discardPile, JOKER_CARD)).toBe(0);
    expect(countCard(s.drawPile, JOKER_CARD)).toBe(1);
  });
});
