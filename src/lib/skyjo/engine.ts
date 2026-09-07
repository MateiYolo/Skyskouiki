import {
  DEFAULT_TARGET_SCORE,
  INITIAL_FLIPS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  buildDeck,
  clearColumns,
  countFaceDown,
  countFaceUp,
  emptyGrid,
  gridSum,
  isFullyRevealed,
  nextRandom,
  shuffle,
} from './rules';
import {
  GRID_SIZE,
  type Action,
  type ActionResult,
  type Cell,
  type GameEvent,
  type GameState,
  type Player,
  type RoundScore,
} from './types';

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export interface CreateGameOptions {
  id: string;
  code: string;
  host: { id: string; name: string; emoji: string };
  seed?: number;
  targetScore?: number;
  now?: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const now = opts.now ?? Date.now();
  return {
    id: opts.id,
    code: opts.code,
    version: 1,
    phase: 'lobby',
    players: [makePlayer(opts.host)],
    hostId: opts.host.id,
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    turnStep: 'choose',
    heldCard: null,
    heldFrom: null,
    roundCloserId: null,
    finalTurnsLeft: null,
    pileExhausted: false,
    round: 0,
    targetScore: opts.targetScore ?? DEFAULT_TARGET_SCORE,
    seed: opts.seed ?? (Math.floor(Math.random() * 0xffffffff) | 0),
    lastEvents: [],
    lastRoundScores: null,
    winnerId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makePlayer(p: { id: string; name: string; emoji: string }): Player {
  return {
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    grid: emptyGrid(),
    totalScore: 0,
    roundScores: [],
    connected: true,
  };
}

// ---------------------------------------------------------------------------
// Réducteur
// ---------------------------------------------------------------------------

const fail = (error: string): ActionResult => ({ ok: false, error });

/**
 * Applique une action. Fonction pure : l'état d'entrée n'est jamais muté.
 * Toute la validation (tour du joueur, étape, indices) se fait ici, côté serveur.
 */
export function applyAction(input: GameState, action: Action): ActionResult {
  const s: GameState = structuredClone(input);
  const events: GameEvent[] = [];
  s.lastEvents = events;

  const commit = (): ActionResult => {
    s.version = input.version + 1;
    s.updatedAt = Date.now();
    return { ok: true, state: s };
  };

  switch (action.type) {
    // -- Salon ---------------------------------------------------------------
    case 'join': {
      const existing = s.players.find((p) => p.id === action.playerId);
      if (existing) {
        existing.connected = true;
        existing.name = action.name || existing.name;
        existing.emoji = action.emoji || existing.emoji;
        return commit();
      }
      if (s.phase !== 'lobby') return fail('La partie a déjà commencé.');
      if (s.players.length >= MAX_PLAYERS) return fail('La partie est complète.');
      s.players.push(makePlayer({ id: action.playerId, name: action.name, emoji: action.emoji }));
      return commit();
    }

    case 'leave': {
      const idx = s.players.findIndex((p) => p.id === action.playerId);
      if (idx === -1) return fail('Joueur inconnu.');
      if (s.phase === 'lobby') {
        s.players.splice(idx, 1);
        if (s.players.length === 0) return fail('Partie vide.');
        if (action.playerId === s.hostId) s.hostId = s.players[0].id;
      } else {
        s.players[idx].connected = false;
      }
      return commit();
    }

    case 'startGame': {
      if (s.phase !== 'lobby') return fail('La partie a déjà commencé.');
      if (action.playerId !== s.hostId) return fail("Seul l'hôte peut lancer la partie.");
      if (s.players.length < MIN_PLAYERS) return fail('Il faut au moins 2 joueurs.');
      dealRound(s, events);
      return commit();
    }

    // -- Retournement initial ------------------------------------------------
    case 'flipInitial': {
      if (s.phase !== 'initialFlip') return fail('Ce n’est pas le moment.');
      const player = s.players.find((p) => p.id === action.playerId);
      if (!player) return fail('Joueur inconnu.');
      if (countFaceUp(player.grid) >= INITIAL_FLIPS)
        return fail('Tu as déjà retourné tes deux cartes.');
      const cell = cellAt(player.grid, action.index);
      if (!cell) return fail('Case invalide.');
      if (cell.faceUp) return fail('Cette carte est déjà retournée.');
      cell.faceUp = true;
      events.push({ type: 'initialFlip', playerId: player.id, index: action.index, value: cell.value });
      maybeStartPlay(s, events);
      return commit();
    }

    // -- Tour de jeu ---------------------------------------------------------
    case 'drawFromPile': {
      const err = requireTurn(s, action.playerId, 'choose');
      if (err) return fail(err);
      if (!replenishDrawPile(s, events))
        return fail('La pioche est vide : prends la carte de la défausse.');
      s.heldCard = s.drawPile.pop()!;
      s.heldFrom = 'draw';
      s.turnStep = 'holding';
      events.push({ type: 'drew', playerId: action.playerId, from: 'draw' });
      return commit();
    }

    case 'takeDiscard': {
      const err = requireTurn(s, action.playerId, 'choose');
      if (err) return fail(err);
      if (s.discardPile.length === 0) return fail('La défausse est vide.');
      s.heldCard = s.discardPile.pop()!;
      s.heldFrom = 'discard';
      s.turnStep = 'holding';
      events.push({ type: 'drew', playerId: action.playerId, from: 'discard' });
      return commit();
    }

    case 'placeCard': {
      const err = requireTurn(s, action.playerId, 'holding');
      if (err) return fail(err);
      const player = s.players[s.currentPlayerIndex];
      const cell = cellAt(player.grid, action.index);
      if (!cell) return fail('Case invalide.');
      const replaced = cell.value;
      const placed = s.heldCard!;
      s.discardPile.push(replaced);
      cell.value = placed;
      cell.faceUp = true;
      events.push({
        type: 'placed',
        playerId: player.id,
        index: action.index,
        placed,
        discarded: replaced,
      });
      resolveColumns(s, player, events);
      endTurn(s, events);
      return commit();
    }

    case 'discardHeld': {
      const err = requireTurn(s, action.playerId, 'holding');
      if (err) return fail(err);
      if (s.heldFrom !== 'draw')
        return fail('Une carte prise dans la défausse doit être placée dans ta grille.');
      const player = s.players[s.currentPlayerIndex];
      if (countFaceDown(player.grid) === 0)
        return fail('Tu n’as plus de carte à retourner : place la carte dans ta grille.');
      const value = s.heldCard!;
      s.discardPile.push(value);
      s.heldCard = null;
      s.heldFrom = null;
      s.turnStep = 'mustFlip';
      events.push({ type: 'discarded', playerId: player.id, value });
      return commit();
    }

    case 'flipCard': {
      const err = requireTurn(s, action.playerId, 'mustFlip');
      if (err) return fail(err);
      const player = s.players[s.currentPlayerIndex];
      const cell = cellAt(player.grid, action.index);
      if (!cell) return fail('Case invalide.');
      if (cell.faceUp) return fail('Choisis une carte face cachée.');
      cell.faceUp = true;
      events.push({ type: 'flipped', playerId: player.id, index: action.index, value: cell.value });
      resolveColumns(s, player, events);
      endTurn(s, events);
      return commit();
    }

    // -- Enchaînement des manches -------------------------------------------
    case 'nextRound': {
      if (s.phase !== 'roundOver') return fail('La manche n’est pas terminée.');
      if (!s.players.some((p) => p.id === action.playerId)) return fail('Joueur inconnu.');
      dealRound(s, events);
      return commit();
    }

    case 'playAgain': {
      if (s.phase !== 'gameOver') return fail('La partie n’est pas terminée.');
      if (!s.players.some((p) => p.id === action.playerId)) return fail('Joueur inconnu.');
      for (const p of s.players) {
        p.totalScore = 0;
        p.roundScores = [];
      }
      s.winnerId = null;
      s.round = 0;
      dealRound(s, events);
      return commit();
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function cellAt(grid: Cell[], index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) return null;
  return grid[index];
}

function requireTurn(s: GameState, playerId: string, step: GameState['turnStep']): string | null {
  if (s.phase !== 'playing') return 'Ce n’est pas le moment.';
  const current = s.players[s.currentPlayerIndex];
  if (!current || current.id !== playerId) return 'Ce n’est pas ton tour.';
  if (s.turnStep !== step) {
    if (s.turnStep === 'mustFlip') return 'Tu dois retourner une carte face cachée.';
    if (s.turnStep === 'holding') return 'Tu as déjà une carte en main.';
    return 'Action impossible maintenant.';
  }
  return null;
}

/** Distribue une nouvelle manche : 12 cartes face cachée par joueur, 1 carte en défausse. */
function dealRound(s: GameState, events: GameEvent[]) {
  const { items: deck, seed } = shuffle(buildDeck(), s.seed);
  s.seed = seed;
  for (const p of s.players) {
    p.grid = Array.from({ length: GRID_SIZE }, () => ({ value: deck.pop()!, faceUp: false }));
  }
  s.discardPile = [deck.pop()!];
  s.drawPile = deck;
  s.turnStep = 'choose';
  s.heldCard = null;
  s.heldFrom = null;
  s.roundCloserId = null;
  s.finalTurnsLeft = null;
  s.pileExhausted = false;
  s.lastRoundScores = null;
  s.currentPlayerIndex = 0;
  s.round += 1;
  s.phase = 'initialFlip';
  events.push({ type: 'roundStarted', round: s.round });
}

/**
 * Une fois que tout le monde a retourné ses 2 cartes, le joueur dont la somme
 * des cartes visibles est la plus haute commence (départage : plus grosse carte,
 * puis tirage au sort déterministe).
 */
function maybeStartPlay(s: GameState, events: GameEvent[]) {
  if (!s.players.every((p) => countFaceUp(p.grid) >= INITIAL_FLIPS)) return;

  const stats = s.players.map((p, index) => {
    const values = p.grid.filter((c): c is NonNullable<Cell> => !!c && c.faceUp).map((c) => c.value);
    return { index, sum: values.reduce((a, b) => a + b, 0), max: Math.max(...values) };
  });
  const bestSum = Math.max(...stats.map((x) => x.sum));
  let candidates = stats.filter((x) => x.sum === bestSum);
  const bestMax = Math.max(...candidates.map((x) => x.max));
  candidates = candidates.filter((x) => x.max === bestMax);
  if (candidates.length > 1) {
    const r = nextRandom(s.seed);
    s.seed = r.seed;
    candidates = [candidates[Math.floor(r.value * candidates.length)]];
  }

  s.currentPlayerIndex = candidates[0].index;
  s.phase = 'playing';
  s.turnStep = 'choose';
  events.push({ type: 'turnStarted', playerId: s.players[s.currentPlayerIndex].id });
}

function resolveColumns(s: GameState, player: Player, events: GameEvent[]) {
  for (const cleared of clearColumns(player.grid, s.discardPile)) {
    events.push({ type: 'columnCleared', playerId: player.id, ...cleared });
  }
}

/** Reconstitue la pioche à partir de la défausse si besoin. Renvoie false si impossible. */
function replenishDrawPile(s: GameState, events: GameEvent[]): boolean {
  if (s.drawPile.length > 0) return true;
  if (s.discardPile.length <= 1) return false;
  const top = s.discardPile.pop()!;
  const { items, seed } = shuffle(s.discardPile, s.seed);
  s.drawPile = items;
  s.seed = seed;
  s.discardPile = [top];
  events.push({ type: 'pileReshuffled' });
  return true;
}

function endTurn(s: GameState, events: GameEvent[]) {
  const player = s.players[s.currentPlayerIndex];
  s.heldCard = null;
  s.heldFrom = null;
  s.turnStep = 'choose';

  if (s.roundCloserId === null && isFullyRevealed(player.grid)) {
    // Le joueur a révélé toute sa grille : chaque adversaire joue encore un tour.
    s.roundCloserId = player.id;
    s.finalTurnsLeft = s.players.length - 1;
    events.push({ type: 'lastTurnTriggered', playerId: player.id });
  } else if (s.finalTurnsLeft !== null) {
    s.finalTurnsLeft -= 1;
  }

  // Cas limite officiel : pioche épuisée et défausse non reconstituable.
  if (s.drawPile.length === 0 && s.discardPile.length <= 1) s.pileExhausted = true;

  if ((s.finalTurnsLeft !== null && s.finalTurnsLeft <= 0) || s.pileExhausted) {
    finishRound(s, events);
    return;
  }

  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  events.push({ type: 'turnStarted', playerId: s.players[s.currentPlayerIndex].id });
}

/**
 * Fin de manche : on révèle tout, on applique une dernière fois la règle des
 * colonnes, puis on compte. Le joueur qui a fermé la manche double son score
 * s'il n'a pas, seul, le total le plus bas — et seulement si ce total est positif.
 */
function finishRound(s: GameState, events: GameEvent[]) {
  for (const p of s.players) {
    for (const cell of p.grid) if (cell) cell.faceUp = true;
    resolveColumns(s, p, events);
  }

  const raws = s.players.map((p) => gridSum(p.grid));
  const closerIndex = s.roundCloserId
    ? s.players.findIndex((p) => p.id === s.roundCloserId)
    : -1;

  const scores: RoundScore[] = s.players.map((p, i) => {
    const raw = raws[i];
    const closedRound = i === closerIndex;
    const strictlyLowest = raws.every((other, j) => j === i || other > raw);
    const doubled = closedRound && raw > 0 && !strictlyLowest;
    return { playerId: p.id, raw, final: doubled ? raw * 2 : raw, doubled, closedRound };
  });

  scores.forEach((sc, i) => {
    s.players[i].roundScores.push(sc.final);
    s.players[i].totalScore += sc.final;
  });
  s.lastRoundScores = scores;
  s.heldCard = null;
  s.heldFrom = null;
  s.turnStep = 'choose';
  events.push({ type: 'roundOver', scores });

  if (s.players.some((p) => p.totalScore >= s.targetScore)) {
    const best = Math.min(...s.players.map((p) => p.totalScore));
    const winner = s.players.find((p) => p.totalScore === best)!;
    s.phase = 'gameOver';
    s.winnerId = winner.id;
    events.push({ type: 'gameOver', winnerId: winner.id });
  } else {
    s.phase = 'roundOver';
  }
}
