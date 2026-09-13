import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { heldSummary, lastMoves } from './moves';
import { toView } from './view';
import type { Action, GameState } from './types';

function play(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`${action.type}: ${res.error}`);
  return res.state;
}

function started(seed = 42): GameState {
  let s = createGame({ id: 'g1', code: 'TEST', host: { id: 'p0', name: 'Hôte', emoji: '🐙' }, seed, now: 0 });
  s = play(s, { type: 'join', playerId: 'p1', name: 'Lisa', emoji: '🦊' });
  s = play(s, { type: 'startGame', playerId: 'p0' });
  for (const p of s.players) {
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 0 });
    s = play(s, { type: 'flipInitial', playerId: p.id, index: 1 });
  }
  return s;
}

const current = (s: GameState) => s.players[s.currentPlayerIndex].id;
const other = (s: GameState) => s.players.find((p) => p.id !== current(s))!.id;

describe('lastMoves', () => {
  it('dit qui a pioché', () => {
    let s = started();
    const id = current(s);
    s = play(s, { type: 'drawFromPile', playerId: id });
    expect(lastMoves(toView(s, other(s)))).toEqual({ [id]: 'pioche' });
  });

  it('dit qui a pris la défausse', () => {
    let s = started();
    const id = current(s);
    s = play(s, { type: 'takeDiscard', playerId: id });
    expect(lastMoves(toView(s, other(s)))).toEqual({ [id]: 'prend la défausse' });
  });

  it('dit ce qui a été posé et ce qui part à la défausse', () => {
    let s = started();
    const id = current(s);
    s = play(s, { type: 'drawFromPile', playerId: id });
    const held = s.heldCard!;
    const replaced = s.players.find((p) => p.id === id)!.grid[0]!.value;
    s = play(s, { type: 'placeCard', playerId: id, index: 0 });
    expect(lastMoves(toView(s, id))).toEqual({ [id]: `pose ${held}, jette ${replaced}` });
  });

  it('dit ce qui a été jeté puis ce qui a été retourné', () => {
    let s = started();
    const id = current(s);
    s = play(s, { type: 'drawFromPile', playerId: id });
    const held = s.heldCard!;
    s = play(s, { type: 'discardHeld', playerId: id });
    expect(lastMoves(toView(s, id))[id]).toBe(`jette ${held}`);

    s = play(s, { type: 'flipCard', playerId: id, index: 2 });
    const revealed = s.players.find((p) => p.id === id)!.grid[2]!.value;
    expect(lastMoves(toView(s, id))).toEqual({ [id]: `retourne ${revealed}` });
  });

  it('ne raconte rien avant le premier coup', () => {
    const s = started();
    expect(lastMoves(toView(s, 'p0'))).toEqual({});
  });

  // Deux coups dans le même lot : c'est ce que le sondage de secours ramène
  // quand il a pris du retard, et à plusieurs joueurs les deux sont d'auteurs
  // différents. N'en montrer qu'un laissait l'autre jouer dans le dos de tout
  // le monde.
  it('rend un coup par joueur quand plusieurs ont joué dans le même lot', () => {
    let s = started();
    const first = current(s);
    const since = s.version;
    s = play(s, { type: 'drawFromPile', playerId: first });
    s = play(s, { type: 'placeCard', playerId: first, index: 0 });
    const second = current(s);
    s = play(s, { type: 'drawFromPile', playerId: second });

    const moves = lastMoves(toView(s, second, since));
    expect(Object.keys(moves).sort()).toEqual([first, second].sort());
    expect(moves[second]).toBe('pioche');
  });
});

describe('heldSummary', () => {
  it('se tait pour le joueur qui tient la carte', () => {
    let s = started();
    const id = current(s);
    s = play(s, { type: 'drawFromPile', playerId: id });
    expect(heldSummary(toView(s, id))).toBeNull();
  });

  it('annonce une pioche, valeur comprise', () => {
    let s = started();
    const name = s.players[s.currentPlayerIndex].name;
    s = play(s, { type: 'drawFromPile', playerId: current(s) });
    const drawn = s.heldCard!;

    const view = toView(s, other(s));
    expect(heldSummary(view)).toEqual({ text: `${name} a pioché : ${drawn}`, revealed: true });
    expect(view.heldCard).toBe(drawn);
  });

  it('annonce une prise dans la défausse, valeur comprise', () => {
    let s = started();
    const id = current(s);
    const name = s.players.find((p) => p.id === id)!.name;
    const top = s.discardPile.at(-1)!;
    s = play(s, { type: 'takeDiscard', playerId: id });
    const view = toView(s, other(s));
    expect(heldSummary(view)).toEqual({ text: `${name} a pris la défausse : ${top}`, revealed: true });
    expect(view.heldCard).toBe(top);
  });

  it('se tait quand personne ne tient de carte', () => {
    const s = started();
    expect(heldSummary(toView(s, 'p1'))).toBeNull();
  });
});
