import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { toView } from './view';
import type { GameState } from './types';

/**
 * Ce qui se teste ici : personne ne joue dans le dos de personne.
 *
 * Un client ne reçoit pas forcément toutes les versions — deux coups joués coup
 * sur coup tombent souvent dans un seul rafraîchissement. S'il n'obtenait que le
 * dernier lot d'événements, l'adversaire pourrait piocher, poser et éliminer une
 * colonne sans que rien n'apparaisse en face.
 */

const HOST = 'hote';
const GUEST = 'invite';

function started(): GameState {
  let state = createGame({ id: 'g', code: '1234', host: { id: HOST, name: 'Matei', emoji: '🦊' }, seed: 7 });
  const step = (action: Parameters<typeof applyAction>[1]) => {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  };
  step({ type: 'join', playerId: GUEST, name: 'Lisa', emoji: '🐙' });
  step({ type: 'startGame', playerId: HOST });
  return state;
}

/** Retourne deux cartes pour chaque joueur : la manche peut commencer. */
function afterInitialFlips(state: GameState): GameState {
  let current = state;
  for (const id of [HOST, GUEST]) {
    for (let k = 0; k < 2; k++) {
      const grid = current.players.find((p) => p.id === id)!.grid;
      const index = grid.findIndex((c) => c && !c.faceUp);
      const result = applyAction(current, { type: 'flipInitial', playerId: id, index });
      if (!result.ok) throw new Error(result.error);
      current = result.state;
    }
  }
  return current;
}

describe('toView — rattrapage des coups manqués', () => {
  it('rend tous les événements depuis la version connue du client', () => {
    const state = afterInitialFlips(started());
    const seen = state.version;

    const drawer = state.players[state.currentPlayerIndex].id;
    const drew = applyAction(state, { type: 'drawFromPile', playerId: drawer });
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    const discarded = applyAction(drew.state, { type: 'discardHeld', playerId: drawer });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;

    // Le témoin n'a vu ni l'un ni l'autre : il doit recevoir les deux.
    const witness = drawer === HOST ? GUEST : HOST;
    const types = toView(discarded.state, witness, seen).lastEvents.map((e) => e.type);
    expect(types).toContain('drew');
    expect(types).toContain('discarded');
  });

  it('s’en tient au dernier coup quand le client est à jour', () => {
    const state = afterInitialFlips(started());
    const drawer = state.players[state.currentPlayerIndex].id;
    const drew = applyAction(state, { type: 'drawFromPile', playerId: drawer });
    if (!drew.ok) throw new Error(drew.error);

    const view = toView(drew.state, HOST, drew.state.version);
    expect(view.lastEvents).toEqual(drew.state.lastEvents);
  });

  it('sans version connue, ne rejoue que le dernier coup', () => {
    const state = afterInitialFlips(started());
    const drawer = state.players[state.currentPlayerIndex].id;
    const drew = applyAction(state, { type: 'drawFromPile', playerId: drawer });
    if (!drew.ok) throw new Error(drew.error);

    expect(toView(drew.state, HOST).lastEvents).toEqual(drew.state.lastEvents);
  });

  it('se rabat sur le dernier coup pour une partie sans journal', () => {
    // Les parties créées avant l'existence du journal vivent encore en base.
    const state = afterInitialFlips(started());
    const drawer = state.players[state.currentPlayerIndex].id;
    const drew = applyAction(state, { type: 'drawFromPile', playerId: drawer });
    if (!drew.ok) throw new Error(drew.error);

    const legacy = { ...drew.state, eventLog: undefined } as unknown as GameState;
    expect(toView(legacy, HOST, 1).lastEvents).toEqual(drew.state.lastEvents);
  });

  it('borne le journal : une longue partie ne le fait pas enfler', () => {
    let state = afterInitialFlips(started());
    for (let i = 0; i < 60; i++) {
      const player = state.players[state.currentPlayerIndex].id;
      const drew = applyAction(state, { type: 'drawFromPile', playerId: player });
      if (!drew.ok) break;
      const next = applyAction(drew.state, { type: 'discardHeld', playerId: player });
      if (!next.ok) break;
      const grid = next.state.players.find((p) => p.id === player)!.grid;
      const index = grid.findIndex((c) => c && !c.faceUp);
      if (index === -1) break;
      const flipped = applyAction(next.state, { type: 'flipCard', playerId: player, index });
      if (!flipped.ok) break;
      state = flipped.state;
    }
    expect(state.eventLog.length).toBeLessThanOrEqual(24);
  });
});
