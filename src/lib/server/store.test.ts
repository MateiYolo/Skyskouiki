import { afterEach, describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@/lib/skyjo';
import { installBackend, performAction, type Backend } from './store';

/**
 * Ce que fait le magasin quand l'écriture part sans revenir.
 *
 * C'est le seul endroit du jeu où une panne de réseau peut produire une faute
 * de règle : une écriture sans réponse a pu avoir lieu, et la rejouer jouerait
 * le coup deux fois. Les deux tests ci-dessous tiennent les deux bouts — ne pas
 * rejouer ce qui est passé, rejouer ce qui ne l'est pas — parce qu'un seul des
 * deux se satisferait d'un code qui abandonne, ou d'un code qui double.
 */

type Mode = 'normal' | 'muette-mais-écrite' | 'muette-et-perdue';

function fakeBackend(initial: GameState) {
  let stored = structuredClone(initial);
  const counts = { commits: 0, writes: 0 };
  let next: Mode = 'normal';

  const backend: Backend = {
    async create() {
      throw new Error('non utilisé ici');
    },
    async load() {
      return structuredClone(stored);
    },
    async commit(state, expectedVersion) {
      counts.commits++;
      if (stored.version !== expectedVersion) {
        return { outcome: 'stale', state: structuredClone(stored) };
      }
      const mode = next;
      next = 'normal';
      if (mode === 'muette-et-perdue') return { outcome: 'silent' };
      stored = structuredClone(state);
      counts.writes++;
      return mode === 'muette-mais-écrite' ? { outcome: 'silent' } : { outcome: 'written' };
    },
    async publish() {},
  };

  return {
    counts,
    stored: () => stored,
    fail: (mode: Mode) => {
      next = mode;
    },
    install: () => installBackend(backend),
  };
}

function lobby(code: string): GameState {
  return createGame({
    id: '11111111-2222-3333-4444-555555555555',
    code,
    host: { id: 'host', name: 'Hôte', emoji: '🦄' },
  });
}

afterEach(() => installBackend(undefined));

describe('performAction, quand l’écriture ne répond pas', () => {
  it('ne rejoue pas un coup qui était passé', async () => {
    const db = fakeBackend(lobby('100001'));
    db.install();
    const before = db.stored().version;

    db.fail('muette-mais-écrite');
    const view = await performAction('100001', 'p2', {
      type: 'join',
      playerId: 'p2',
      name: 'Deux',
      emoji: '🍄',
    });

    // Une seule écriture, une seule version : le coup n'a pas été joué deux fois.
    expect(db.counts.writes).toBe(1);
    expect(db.stored().version).toBe(before + 1);
    expect(view.version).toBe(before + 1);
    expect(db.stored().players.map((p) => p.id)).toEqual(['host', 'p2']);
  });

  it('rejoue un coup qui ne l’était pas', async () => {
    const db = fakeBackend(lobby('100002'));
    db.install();
    const before = db.stored().version;

    db.fail('muette-et-perdue');
    const view = await performAction('100002', 'p2', {
      type: 'join',
      playerId: 'p2',
      name: 'Deux',
      emoji: '🍄',
    });

    // Deux tentatives, une seule écriture : le coup a bien fini par passer.
    expect(db.counts.commits).toBe(2);
    expect(db.counts.writes).toBe(1);
    expect(db.stored().version).toBe(before + 1);
    expect(view.players.map((p) => p.id)).toEqual(['host', 'p2']);
  });
});
