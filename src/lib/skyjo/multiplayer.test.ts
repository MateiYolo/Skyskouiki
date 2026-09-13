import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import { legalActionsFor } from './view';
import { GRID_SIZE } from './types';
import type { Action, Cell, GameState, Variant } from './types';

/**
 * Le moteur à trois, quatre, cinq et huit joueurs.
 *
 * Tout le reste de la suite se joue à deux — c'est le cas le plus fréquent, et
 * c'est celui sur lequel chaque règle se lit le mieux. Mais deux joueurs
 * cachent précisément ce qui peut casser au-delà : la rotation n'y est qu'un
 * aller-retour, le dernier tour n'y dure qu'un coup, et « le plus petit total »
 * n'y a qu'un seul concurrent. Trois suffit à séparer les trois.
 *
 * D'où une approche différente du reste du fichier : pas un coup écrit à la
 * main par règle, mais des parties entières jouées au hasard *dans les coups
 * légaux*, sur des graines fixes. Ce que ça attrape, ce sont les blocages — une
 * étape de tour dont aucun coup ne sort, une rotation qui saute quelqu'un, une
 * manche qui ne se ferme jamais — c'est-à-dire exactement les pannes qu'un
 * nombre de joueurs inhabituel produit.
 */

function table(playerCount: number, seed: number, variant: Variant): GameState {
  let s = createGame({
    id: 'g',
    code: '424',
    host: { id: 'p0', name: 'J0', emoji: '🦊' },
    seed,
    variant,
    now: 0,
  });
  for (let i = 1; i < playerCount; i++) {
    s = apply(s, { type: 'join', playerId: `p${i}`, name: `J${i}`, emoji: '🐙' });
  }
  return apply(s, { type: 'startGame', playerId: 'p0' });
}

function apply(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) {
    throw new Error(
      `${action.type} refusé : ${res.error} (${state.players.length} joueurs, ${state.phase}/${state.turnStep})`,
    );
  }
  return res.state;
}

/** PRNG de test, indépendant de celui du moteur : la partie reste reproductible. */
function rng(seed: number): () => number {
  let x = seed | 0;
  return () => {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return ((x >>> 1) >>> 0) / 0x80000000;
  };
}

const filled = (grid: readonly Cell[]) =>
  grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);

/**
 * Un coup légal au hasard pour celui qui doit agir.
 *
 * Il joue mal — c'est voulu. Un bot qui cherche à gagner évite les situations
 * rares, et ce sont elles qu'on veut voir : une grille entièrement vidée par
 * ses éliminations, un Vol sans cible, une main qu'on ne peut plus jeter.
 */
function anyLegalMove(s: GameState, rnd: () => number): Action {
  if (s.phase === 'initialFlip') {
    const player = s.players.find((p) => p.grid.filter((c) => c?.faceUp).length < 2)!;
    const hidden = player.grid
      .map((c, i) => (c && !c.faceUp ? i : -1))
      .filter((i) => i >= 0);
    return { type: 'flipInitial', playerId: player.id, index: pick(hidden, rnd) };
  }

  const me = s.players[s.currentPlayerIndex];
  const legal = legalActionsFor(s, me.id);
  const playerId = me.id;

  switch (pick(legal, rnd)) {
    case 'drawFromPile':
      return { type: 'drawFromPile', playerId };
    case 'takeDiscard':
      return { type: 'takeDiscard', playerId };
    case 'discardHeld':
      return { type: 'discardHeld', playerId };
    case 'placeCard':
      return { type: 'placeCard', playerId, index: pick(filled(me.grid), rnd) };
    case 'flipCard': {
      const hidden = me.grid.map((c, i) => (c && !c.faceUp ? i : -1)).filter((i) => i >= 0);
      return { type: 'flipCard', playerId, index: pick(hidden, rnd) };
    }
    case 'steal': {
      const victim = pick(
        s.players.filter((p) => p.id !== me.id && p.grid.some((c) => c)),
        rnd,
      );
      return {
        type: 'steal',
        playerId,
        index: pick(filled(me.grid), rnd),
        targetPlayerId: victim.id,
        targetIndex: pick(filled(victim.grid), rnd),
      };
    }
    case 'declineSteal':
      return { type: 'declineSteal', playerId };
    case 'swap': {
      const cells = filled(me.grid);
      const first = pick(cells, rnd);
      return {
        type: 'swap',
        playerId,
        index: first,
        otherIndex: pick(
          cells.filter((i) => i !== first),
          rnd,
        ),
      };
    }
    case 'declineSwap':
      return { type: 'declineSwap', playerId };
    case 'nextRound':
      return { type: 'nextRound', playerId };
    case 'playAgain':
      return { type: 'playAgain', playerId };
    default:
      throw new Error(`aucun coup jouable : ${s.phase}/${s.turnStep} (${legal.join(', ')})`);
  }
}

function pick<T>(items: readonly T[], rnd: () => number): T {
  if (items.length === 0) throw new Error('rien à tirer');
  return items[Math.floor(rnd() * items.length)];
}

const COUNTS = [3, 4, 5, 8];
const SEEDS = 25;
/** Large : une partie à huit joueurs dépasse le millier d'actions. */
const MAX_ACTIONS = 30000;

describe('parties à plus de deux joueurs', () => {
  for (const variant of ['classic', 'spicy'] as const) {
    for (const players of COUNTS) {
      it(`${players} joueurs (${variant}) : la partie va jusqu'à son terme`, () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
          let s = table(players, seed * 7919, variant);
          const rnd = rng(seed * 104729);
          const played = new Set<string>();
          let actions = 0;

          while (s.phase !== 'gameOver') {
            expect(actions++).toBeLessThan(MAX_ACTIONS);
            if (s.phase === 'playing') played.add(s.players[s.currentPlayerIndex].id);
            const before = s.version;
            s = apply(s, anyLegalMove(s, rnd));
            // La version est le verrou optimiste du magasin : elle doit avancer
            // d'un cran par coup, quel que soit le nombre de joueurs.
            expect(s.version).toBe(before + 1);
            expect(s.players).toHaveLength(players);
            for (const p of s.players) expect(p.grid).toHaveLength(GRID_SIZE);
          }

          // Tout le monde a joué : une rotation qui saute un joueur ne se voit
          // pas autrement — la partie se termine quand même, sans lui.
          expect(played.size).toBe(players);
          const lowest = Math.min(...s.players.map((p) => p.totalScore));
          expect(s.players.find((p) => p.id === s.winnerId)!.totalScore).toBe(lowest);
          expect(s.players.some((p) => p.totalScore >= s.targetScore)).toBe(true);
        }
      });
    }
  }

  it('le comptage de fin de manche tient à n’importe quel nombre de joueurs', () => {
    for (const players of COUNTS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        let s = table(players, seed * 31337, 'classic');
        const rnd = rng(seed * 7);
        let checked = 0;

        while (s.phase !== 'gameOver' && checked < 3) {
          s = apply(s, anyLegalMove(s, rnd));
          const ended = s.lastEvents.find((e) => e.type === 'roundOver');
          if (!ended) continue;
          checked++;

          const scores = s.lastRoundScores!;
          expect(scores).toHaveLength(players);
          // Une manche ne se ferme qu'une fois, et par une seule personne.
          expect(scores.filter((x) => x.closedRound).length).toBeLessThanOrEqual(1);
          for (const score of scores) {
            expect(score.final).toBe(score.doubled ? score.raw * 2 : score.raw);
            // La pénalité ne frappe que celui qui a fermé, et seulement s'il
            // n'est pas *seul* au plus bas. À plusieurs, l'égalité devient
            // fréquente — et une égalité suffit à doubler, c'est la règle.
            if (score.doubled) {
              expect(score.closedRound).toBe(true);
              expect(
                scores.some((other) => other.playerId !== score.playerId && other.raw <= score.raw),
              ).toBe(true);
            }
          }
          // Les totaux cumulés suivent les manches, pour tout le monde.
          for (const player of s.players) {
            const sum = player.roundScores.reduce((a, b) => a + b, 0);
            expect(player.totalScore).toBe(sum);
          }
        }
      }
    }
  });

  it('après la fermeture, chaque adversaire joue exactement un tour', () => {
    for (const players of COUNTS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        let s = table(players, seed * 65537, 'classic');
        const rnd = rng(seed * 13);
        let turnsAfterClose: string[] | null = null;

        while (s.phase === 'initialFlip' || s.phase === 'playing') {
          const closerBefore = s.roundCloserId;
          if (s.phase === 'playing' && turnsAfterClose) {
            turnsAfterClose.push(s.players[s.currentPlayerIndex].id);
          }
          s = apply(s, anyLegalMove(s, rnd));
          if (!closerBefore && s.roundCloserId && !turnsAfterClose) turnsAfterClose = [];
        }

        // La pioche épuisée arrête la manche plus tôt : ce cas-là a sa propre
        // règle, et ce n'est pas celle qu'on mesure ici.
        if (!turnsAfterClose || s.pileExhausted) continue;
        const seats = new Set(turnsAfterClose);
        expect(seats.size).toBe(players - 1);
        expect(seats.has(s.roundCloserId!)).toBe(false);
      }
    }
  });
});
