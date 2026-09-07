/**
 * Test de bout en bout de l'API : deux joueurs, une partie complète jouée par
 * HTTP jusqu'à ce que quelqu'un atteigne le seuil.
 *
 * Vérifie ce que les tests unitaires du moteur ne couvrent pas : les routes, la
 * validation, le verrou optimiste et le magasin (mémoire ou Supabase selon la
 * configuration).
 *
 *   npm run dev            # dans un terminal
 *   node scripts/smoke.mjs # dans un autre
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const A = crypto.randomUUID();
const B = crypto.randomUUID();

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url} -> ${json.error ?? res.status}`);
  return json;
}

const act = (code, playerId, action) => post(`${BASE}/api/games/${code}`, { playerId, action });
const view = async (code, playerId) =>
  (await fetch(`${BASE}/api/games/${code}?playerId=${playerId}`)).json();

/** Un tour « le plus vite possible » : on découvre une carte à chaque passage. */
async function playTurn(code, state) {
  const id = state.currentPlayerId;
  const grid = state.players.find((p) => p.id === id).grid;
  const hidden = grid.findIndex((cell) => cell && cell.faceUp === false);

  await act(code, id, { type: 'drawFromPile' });
  if (hidden === -1) {
    await act(code, id, { type: 'placeCard', index: grid.findIndex((c) => c !== null) });
  } else {
    await act(code, id, { type: 'discardHeld' });
    await act(code, id, { type: 'flipCard', index: hidden });
  }
}

async function main() {
  const { code } = await post(`${BASE}/api/games`, { playerId: A, name: 'Matei', emoji: '🦊' });
  console.log('partie créée :', code);

  await act(code, B, { type: 'join', name: 'Lisa', emoji: '🐙' });
  await act(code, A, { type: 'startGame' });

  for (let step = 0; step < 5000; step++) {
    const state = await view(code, A);

    if (state.phase === 'gameOver') {
      const winner = state.players.find((p) => p.id === state.winnerId);
      console.log(`fin de partie après ${state.round} manche(s) — ${winner.name} gagne`);
      console.log(state.players.map((p) => `${p.name}: ${p.totalScore}`).join(' · '));
      return;
    }
    if (state.phase === 'initialFlip') {
      for (const id of [A, B]) {
        for (const index of [0, 1]) await act(code, id, { type: 'flipInitial', index });
      }
      continue;
    }
    if (state.phase === 'roundOver') {
      const line = state.lastRoundScores
        .map((s) => `${s.raw}${s.doubled ? ' ×2' : ''} → ${s.final}`)
        .join(' | ');
      console.log(`  manche ${state.round} : ${line}`);
      await act(code, A, { type: 'nextRound' });
      continue;
    }
    await playTurn(code, state);
  }
  throw new Error('la partie ne s’est jamais terminée');
}

main().catch((error) => {
  console.error('ÉCHEC :', error.message);
  process.exit(1);
});
