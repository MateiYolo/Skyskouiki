import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { DECK_COMPOSITION, DECK_SIZE, buildDeck, columnIndices, shuffle } from './rules';
import { toView } from './view';
import type { Action, Cell, GameState } from './types';

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
function setGrid(s: GameState, playerId: string, values: Array<number | null>, faceUp = true) {
  const p = s.players.find((x) => x.id === playerId)!;
  p.grid = values.map<Cell>((v) => (v === null ? null : { value: v, faceUp }));
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
    const counts = new Map<number, number>();
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
    expect(a.slice().sort((x, y) => x - y)).toEqual(buildDeck().sort((x, y) => x - y));
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
    s.discardPile = [...s.drawPile, ...s.discardPile];
    s.drawPile = [];
    const total = s.discardPile.length;

    s = play(s, { type: 'drawFromPile', playerId: id });
    expect(s.lastEvents.some((e) => e.type === 'pileReshuffled')).toBe(true);
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile.length + s.discardPile.length + 1).toBe(total);
  });
});

// --- colonnes ---------------------------------------------------------------

/** Grille sans aucune colonne homogène : sert de base neutre aux scénarios. */
const CLEAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('règle des colonnes', () => {
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
      type: 'columnCleared',
      playerId: id,
      column: 1,
      value: 8,
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

// Grilles sans colonne homogène, écrites ligne par ligne (3 lignes × 4 colonnes).
const LOW = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]; // total 10
const HIGH = [12, 12, 12, 12, 12, 12, 12, 12, 11, 10, 9, 8]; // total 134
const MID = [1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 3, 4]; // total 17
const NEG_HIGH = [-1, -1, -1, -1, -1, -1, -1, -1, 0, -2, 0, -2]; // total -12
const NEG_LOW = [-2, -2, -2, -2, -2, -2, -2, -2, -1, 0, -1, 0]; // total -18

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
    expect(scores[1].raw).toBe(10);
    expect(scores[0].closedRound).toBe(true);
    expect(scores[1].closedRound).toBe(false);
  });

  it('double le score du fermeur qui n’a pas le total le plus bas', () => {
    const s = scoreRound(HIGH, LOW);
    const [a, b] = s.lastRoundScores!;
    expect(a.raw).toBe(134);
    expect(a.doubled).toBe(true);
    expect(a.final).toBe(268);
    expect(b.doubled).toBe(false);
    expect(b.final).toBe(10);
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
    expect(a.raw).toBe(10);
    expect(a.doubled).toBe(false);
    expect(a.final).toBe(10);
  });

  it('ne double jamais un total négatif ou nul', () => {
    const s = scoreRound(NEG_HIGH, NEG_LOW);
    const [a, b] = s.lastRoundScores!;
    expect(a.raw).toBe(-12);
    expect(b.raw).toBe(-18);
    expect(b.raw).toBeLessThan(a.raw); // le fermeur n'est pas le plus bas…
    expect(a.doubled).toBe(false); // …mais son total est négatif : pas de pénalité
    expect(a.final).toBe(-12);
  });

  it('cumule les manches et termine la partie à 100 points, le plus bas gagne', () => {
    const s = scoreRound(HIGH, LOW, 100);
    expect(s.phase).toBe('gameOver');
    expect(s.players[0].totalScore).toBe(268);
    expect(s.players[1].totalScore).toBe(10);
    expect(s.winnerId).toBe('p1');
  });

  it('ne termine pas la partie tant que personne n’atteint le seuil', () => {
    const s = scoreRound(LOW, MID, 100);
    expect(s.phase).toBe('roundOver');
    expect(s.winnerId).toBeNull();
    expect(s.players[0].roundScores).toEqual([10]);
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

  it('montre la carte en main au joueur actif seulement', () => {
    let s = started(2);
    const id = s.players[s.currentPlayerIndex].id;
    const other = s.players[(s.currentPlayerIndex + 1) % 2].id;
    s = play(s, { type: 'drawFromPile', playerId: id });

    expect(toView(s, id).heldCard).toBe(s.heldCard);
    expect(toView(s, other).heldCard).toBeNull();
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
