import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { toSharedView, toView, viewFor } from './view';
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

/**
 * Ce qui se teste ici : la vue diffusée dit exactement la même chose que la
 * vue demandée.
 *
 * Le serveur ne publie plus qu'une seule projection pour toute la table, et
 * chaque téléphone se l'adresse à lui-même. Tout l'intérêt — plus d'aller-retour
 * pour apprendre un coup — repose sur le fait que `viewFor` retrouve, à partir
 * de la vue seule, ce que le serveur aurait calculé depuis l'état complet. Si
 * les deux divergeaient d'un champ, un joueur taperait sur une carte que le
 * serveur refuserait ensuite : la latence reviendrait par la porte du fond,
 * sous forme d'un coup annulé.
 */
describe('vue diffusée', () => {
  const situations = (): Array<[string, GameState]> => {
    const lobby = createGame({
      id: 'g',
      code: '1234',
      host: { id: HOST, name: 'Matei', emoji: '🦊' },
      seed: 3,
    });
    const joined = applyAction(lobby, { type: 'join', playerId: GUEST, name: 'Lisa', emoji: '🐙' });
    if (!joined.ok) throw new Error(joined.error);

    const flipping = started();
    const playing = afterInitialFlips(flipping);
    const drew = applyAction(playing, {
      type: 'drawFromPile',
      playerId: playing.players[playing.currentPlayerIndex].id,
    });
    if (!drew.ok) throw new Error(drew.error);

    return [
      ['salon', joined.state],
      ['retournements initiaux', flipping],
      ['en jeu, choix', playing],
      ['en jeu, carte en main', drew.state],
    ];
  };

  it('rend la même vue que celle qu’on serait allé chercher', () => {
    for (const [label, state] of situations()) {
      const shared = toSharedView(state);
      for (const viewer of [HOST, GUEST, 'un-inconnu']) {
        expect(viewFor(shared, viewer), `${label} / ${viewer}`).toEqual(toView(state, viewer));
      }
    }
  });

  it('ne dit rien de plus à un joueur qu’à un autre', () => {
    for (const [label, state] of situations()) {
      const mine = toView(state, HOST) as unknown as Record<string, unknown>;
      const theirs = toView(state, GUEST) as unknown as Record<string, unknown>;
      const differs = Object.keys(mine).filter(
        (key) => JSON.stringify(mine[key]) !== JSON.stringify(theirs[key]),
      );
      // Les deux champs qui nomment le lecteur ont le droit de différer : ce
      // sont justement ceux que `viewFor` recalcule. Tout le reste doit être
      // identique — si un jour un autre champ dépend du lecteur, il ne peut
      // plus se diffuser, et c'est ce test qui l'attrape avant le canal.
      expect(differs.filter((key) => key !== 'you' && key !== 'legalActions'), label).toEqual([]);
    }
  });
});
