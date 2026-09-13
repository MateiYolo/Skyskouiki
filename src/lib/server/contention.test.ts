import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameState } from '@/lib/skyjo';
import { installBackend, performAction, type Backend } from './store';

/**
 * Ce qui arrive quand plusieurs joueurs écrivent en même temps.
 *
 * Un tour de Skyjo est séquentiel : à tout instant, un seul joueur a le droit
 * d'écrire, et le verrou optimiste n'a rien à arbitrer. Sauf à un endroit — le
 * **retournement initial**, où toute la table joue d'un coup — et cet
 * endroit-là revient à chaque manche.
 *
 * D'où ce fichier, qui ne teste pas une règle mais une arithmétique : à quatre
 * joueurs ce sont huit écritures concurrentes sur la même ligne, à huit c'est
 * seize, et celui qui perd toutes les courses a besoin d'autant de tentatives
 * qu'il y a de concurrents. Avec six, il repartait avec un bandeau rouge sur un
 * coup parfaitement légal.
 *
 * Le tout se joue contre un dos **à latence** : sans elle, les requêtes se
 * sérialisent d'elles-mêmes dans la boucle d'événements et la contention
 * n'existe pas. C'est exactement pourquoi le défaut ne se voyait pas en
 * développement, où les parties vivent en mémoire.
 */

/** Un dos qui coûte un aller-retour à chaque appel, comme une vraie base. */
function slowBackend(initial: GameState, roundTrip: number) {
  let stored = structuredClone(initial);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const stats = { loads: 0, commits: 0, refused: 0 };

  const backend: Backend = {
    async create() {
      throw new Error('non utilisé ici');
    },
    async load() {
      stats.loads++;
      await sleep(roundTrip);
      return structuredClone(stored);
    },
    async commit(state, expectedVersion) {
      stats.commits++;
      // La latence est payée avant l'arbitrage, comme en base : c'est pendant
      // ce temps-là que les autres écritures se glissent.
      await sleep(roundTrip);
      if (stored.version !== expectedVersion) {
        stats.refused++;
        return { outcome: 'stale', state: structuredClone(stored) };
      }
      stored = structuredClone(state);
      return { outcome: 'written' };
    },
    async publish() {},
  };

  return { stats, stored: () => stored, install: () => installBackend(backend) };
}

/** Une partie lancée, tout le monde encore face cachée. */
function dealt(players: number): GameState {
  let s = createGame({
    id: '11111111-2222-3333-4444-555555555555',
    code: '424',
    host: { id: 'p0', name: 'J0', emoji: '🦊' },
    seed: 7,
    now: 0,
  });
  for (let i = 1; i < players; i++) {
    s = apply(s, { type: 'join', playerId: `p${i}`, name: `J${i}`, emoji: '🐙' });
  }
  return apply(s, { type: 'startGame', playerId: 'p0' });
}

function apply(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

afterEach(() => installBackend(undefined));

describe('retournements initiaux simultanés', () => {
  for (const roundTrip of [15, 40]) {
    for (const players of [2, 4, 6, 8]) {
      it(`${players} joueurs, ${roundTrip} ms d’aller-retour : personne ne perd son coup`, async () => {
        const back = slowBackend(dealt(players), roundTrip);
        back.install();

        // Tout le monde tape ses deux cartes dans la même milliseconde : c'est
        // le pire cas, et il n'est pas absurde — la manche vient de commencer
        // et les douze dos apparaissent au même instant sur tous les écrans.
        const refusals: string[] = [];
        const calls = [];
        for (let i = 0; i < players; i++) {
          for (const index of [0, 5]) {
            calls.push(
              performAction('424', `p${i}`, {
                type: 'flipInitial',
                playerId: `p${i}`,
                index,
              }).catch((error: Error) => {
                refusals.push(error.message);
              }),
            );
          }
        }
        await Promise.all(calls);

        expect(refusals).toEqual([]);
        // Les seize coups ont bien tous porté, et sur la bonne grille.
        const state = back.stored();
        for (const player of state.players) {
          expect(player.grid.filter((cell) => cell?.faceUp)).toHaveLength(2);
        }
        // La table est passée en jeu d'elle-même : personne n'est resté en
        // arrière parce que son retournement s'était perdu.
        expect(state.phase).toBe('playing');
      });
    }
  }
});

describe('doublons sur l’enchaînement des manches', () => {
  it('quatre joueurs tapent « manche suivante » : un seul écrit, aucun n’est refusé', async () => {
    // Une manche jouée jusqu'au bout : on force la fin en révélant tout.
    const state = dealt(4);
    for (const player of state.players) for (const cell of player.grid) if (cell) cell.faceUp = true;
    state.phase = 'roundOver';
    state.lastRoundScores = state.players.map((p) => ({
      playerId: p.id,
      raw: 0,
      final: 0,
      doubled: false,
      closedRound: false,
    }));

    const back = slowBackend(state, 10);
    back.install();

    const before = back.stored().version;
    const refusals: string[] = [];
    await Promise.all(
      state.players.map((p) =>
        performAction('424', p.id, { type: 'nextRound', playerId: p.id }).catch((error: Error) => {
          refusals.push(error.message);
        }),
      ),
    );

    expect(refusals).toEqual([]);
    // Une seule distribution : les trois doublons n'ont rien écrit du tout.
    expect(back.stored().version).toBe(before + 1);
    expect(back.stored().round).toBe(state.round + 1);
  });
});
