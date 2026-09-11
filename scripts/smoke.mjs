/**
 * Test de bout en bout de l'API : deux joueurs, une partie complète jouée par
 * HTTP jusqu'à ce que quelqu'un atteigne le seuil — une fois en classique, une
 * fois en spicy, parce que le mode spicy ajoute cinq actions (le choix du
 * mode, le vol et son refus, la valse et son refus) qui doivent franchir la
 * validation et le magasin comme les autres.
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

/**
 * Ce que le paquet spicy a effectivement sorti pendant la partie en cours.
 *
 * Le relevé se fait sur *toutes* les vues qui passent, réponses d'action
 * comprises, et pas seulement sur celles que la boucle principale demande : un
 * Vol se pioche au milieu d'un tour, et un sondage qui n'arrive qu'à la fin du
 * tour ne voit plus que le dernier coup. Chaque version n'est comptée qu'une
 * fois, puisque la même arrive souvent deux fois — une fois en réponse au POST,
 * une fois au sondage suivant.
 */
let seen = null;

function watch(view) {
  if (!seen || typeof view?.version !== 'number' || seen.versions.has(view.version)) return view;
  seen.versions.add(view.version);
  for (const event of view.lastEvents ?? []) {
    if (event.type in seen.events) seen.events[event.type] += 1;
  }
  if (view.players?.some((p) => p.grid?.some((c) => c && c.joker))) seen.jokerSeen = true;
  return view;
}

const act = async (code, playerId, action) =>
  watch(await post(`${BASE}/api/games/${code}`, { playerId, action }));

/**
 * Une action qu'on attend refusée, et le motif du refus.
 *
 * La distinction compte : « Action invalide. » vient de la validation (la forme
 * du corps n'est pas reconnue), tout le reste vient du moteur. Un vol refusé
 * par zod et un vol refusé par la règle se ressemblent vus d'ici, et seul le
 * second prouve que la route sait transporter le coup.
 */
async function refusal(code, playerId, action) {
  const res = await fetch(`${BASE}/api/games/${code}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId, action }),
  });
  const json = await res.json();
  if (res.ok) throw new Error(`${action.type} aurait dû être refusé`);
  if (json.error === 'Action invalide.') {
    throw new Error(`${action.type} rejeté par la validation, pas par la règle`);
  }
  return json.error;
}
const view = async (code, playerId) =>
  watch(await (await fetch(`${BASE}/api/games/${code}?playerId=${playerId}`)).json());

const faceUpCells = (player) =>
  player.grid.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell && cell.faceUp);

/**
 * Le meilleur vol disponible : je prends la plus basse d'en face et je donne ma
 * plus haute. `null` si personne n'a de carte visible à échanger.
 */
function bestSteal(state, id) {
  const mine = faceUpCells(state.players.find((p) => p.id === id));
  if (!mine.length) return null;

  let best = null;
  for (const victim of state.players.filter((p) => p.id !== id)) {
    for (const { cell, index } of faceUpCells(victim)) {
      if (!best || cell.value < best.value) {
        best = { value: cell.value, targetPlayerId: victim.id, targetIndex: index };
      }
    }
  }
  if (!best) return null;

  const give = mine.reduce((a, b) => (b.cell.value > a.cell.value ? b : a));
  return {
    index: give.index,
    targetPlayerId: best.targetPlayerId,
    targetIndex: best.targetIndex,
  };
}

/**
 * Une valse jouable : les deux cases les plus éloignées de ma grille. Le coup
 * n'a rien de malin, mais il déplace bien deux cartes — c'est ce qu'on vérifie
 * ici. `null` s'il n'y a pas deux cases à intervertir.
 */
function bestSwap(state, id) {
  const cells = state.players
    .find((p) => p.id === id)
    .grid.map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell !== null);
  if (cells.length < 2) return null;
  return { index: cells[0].index, otherIndex: cells[cells.length - 1].index };
}

/** Renonce à une carte spéciale, et paie le retournement quand il est dû. */
async function declineAndFlip(code, id, action) {
  const declined = await act(code, id, action);
  if (declined.turnStep !== 'mustFlip') return;
  const next = declined.players
    .find((p) => p.id === id)
    .grid.findIndex((cell) => cell && cell.faceUp === false);
  await act(code, id, { type: 'flipCard', index: next });
}

/** Un tour « le plus vite possible » : on découvre une carte à chaque passage. */
async function playTurn(code, state) {
  const id = state.currentPlayerId;
  const grid = state.players.find((p) => p.id === id).grid;
  const hidden = grid.findIndex((cell) => cell && cell.faceUp === false);

  const drawn = await act(code, id, { type: 'drawFromPile' });

  // Mode spicy : la pioche peut rendre un Vol, qui ne se tient pas en main. Les
  // deux issues passent par l'API — l'échange quand il y a de quoi voler, le
  // refus sinon, qui coûte alors un retournement.
  if (drawn.turnStep === 'stealing') {
    const steal = bestSteal(drawn, id);
    if (steal) {
      await act(code, id, { type: 'steal', ...steal });
      return;
    }
    await declineAndFlip(code, id, { type: 'declineSteal' });
    return;
  }

  // Même chose pour la Valse, à ceci près qu'elle se résout entièrement dans
  // ma grille.
  if (drawn.turnStep === 'swapping') {
    const swap = bestSwap(drawn, id);
    if (swap) {
      await act(code, id, { type: 'swap', ...swap });
      return;
    }
    await declineAndFlip(code, id, { type: 'declineSwap' });
    return;
  }

  if (hidden === -1) {
    await act(code, id, { type: 'placeCard', index: grid.findIndex((c) => c !== null) });
  } else {
    await act(code, id, { type: 'discardHeld' });
    await act(code, id, { type: 'flipCard', index: hidden });
  }
}

/**
 * Les refus que le mode spicy doit savoir prononcer, en passant par la route.
 *
 * Les règles du vol et du joker sont couvertes au coup par coup côté moteur,
 * avec une graine fixe. Ce qu'on vérifie ici, c'est ce que les tests unitaires
 * ne voient pas : que les cinq actions ajoutées franchissent la validation et
 * arrivent jusqu'au moteur. Un vol tiré au hasard ne peut pas s'en charger — il
 * ne sort pas à toutes les parties.
 */
async function checkSpicySurface(code) {
  const notHost = await refusal(code, B, { type: 'setVariant', variant: 'classic' });
  const tooEarly = await refusal(code, A, {
    type: 'steal',
    index: 0,
    targetPlayerId: B,
    targetIndex: 0,
  });
  const nothingToDecline = await refusal(code, A, { type: 'declineSteal' });
  const noSwapYet = await refusal(code, A, { type: 'swap', index: 0, otherIndex: 1 });
  const nothingToRefuse = await refusal(code, A, { type: 'declineSwap' });
  console.log(
    `  refus attendus : « ${notHost} » / « ${tooEarly} » / « ${nothingToDecline} »` +
      ` / « ${noSwapYet} » / « ${nothingToRefuse} »`,
  );
}

async function playGame(variant) {
  const { code } = await post(`${BASE}/api/games`, { playerId: A, name: 'Matei', emoji: '🦊' });
  console.log(`partie ${variant} créée :`, code);

  await act(code, B, { type: 'join', name: 'Lisa', emoji: '🐙' });
  if (variant === 'spicy') await act(code, A, { type: 'setVariant', variant });
  if (variant === 'spicy') await checkSpicySurface(code);
  seen = {
    versions: new Set(),
    events: {
      stealDrawn: 0,
      stole: 0,
      stealDeclined: 0,
      swapDrawn: 0,
      swapped: 0,
      swapDeclined: 0,
    },
    jokerSeen: false,
  };
  const started = await act(code, A, { type: 'startGame' });
  if (started.variant !== variant) throw new Error(`mode attendu ${variant}, reçu ${started.variant}`);

  for (let step = 0; step < 5000; step++) {
    const state = await view(code, A);

    if (state.phase === 'gameOver') {
      const winner = state.players.find((p) => p.id === state.winnerId);
      console.log(`fin de partie après ${state.round} manche(s) — ${winner.name} gagne`);
      console.log(state.players.map((p) => `${p.name}: ${p.totalScore}`).join(' · '));
      if (variant === 'spicy') {
        const { stealDrawn, stole, stealDeclined, swapDrawn, swapped, swapDeclined } = seen.events;
        console.log(
          `  vus : ${stealDrawn} Vol (${stole} échangé(s), ${stealDeclined} refusé(s))` +
            `, ${swapDrawn} Valse (${swapped} jouée(s), ${swapDeclined} refusée(s))` +
            `, joker ${seen.jokerSeen ? 'aperçu en grille' : 'jamais sorti'}`,
        );
      }
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

async function main() {
  for (const variant of ['classic', 'spicy']) await playGame(variant);
}

main().catch((error) => {
  console.error('ÉCHEC :', error.message);
  process.exit(1);
});
