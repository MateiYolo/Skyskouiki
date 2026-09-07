'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { EventLayer } from '@/components/EventLayer';
import { GameOverPanel, RoundSummary } from '@/components/Overlays';
import { Avatar, PlayerPanel } from '@/components/PlayerPanel';
import { PlayerGrid } from '@/components/PlayerGrid';
import { TableCenter } from '@/components/TableCenter';
import { EMOJIS, useIdentity } from '@/lib/client/identity';
import { cue, initAudio, isMuted, setMuted } from '@/lib/client/feedback';
import { useGame } from '@/lib/client/useGame';
import type { GameView } from '@/lib/skyjo';

/** Ce que le joueur doit faire, là, maintenant. */
function prompt(view: GameView): { title: string; hint: string } {
  const me = view.players.find((p) => p.id === view.you.id);
  const current = view.players.find((p) => p.id === view.currentPlayerId);

  switch (view.phase) {
    case 'lobby':
      return { title: 'Salon', hint: 'Partage le code, on démarre à deux.' };
    case 'initialFlip':
      return me && me.faceUpCount < 2
        ? { title: 'Retourne 2 cartes', hint: 'Le plus gros total commence.' }
        : { title: 'Bien joué', hint: 'On attend les autres…' };
    case 'playing':
      if (view.currentPlayerId !== view.you.id) {
        return { title: `${current?.emoji ?? ''} ${current?.name ?? ''} joue`, hint: 'Observe et prépare ton coup.' };
      }
      if (view.turnStep === 'choose') {
        return { title: 'À toi !', hint: 'Pioche, ou prends la carte de la défausse.' };
      }
      if (view.turnStep === 'holding') {
        return view.heldFrom === 'draw'
          ? { title: 'Garde-la ou jette-la', hint: 'Tape une de tes cartes pour l’échanger.' }
          : { title: 'Place la carte', hint: 'Tape la carte que tu veux remplacer.' };
      }
      return { title: 'Retourne une carte', hint: 'Tu as jeté la pioche : il faut en découvrir une.' };
    case 'roundOver':
      return { title: 'Manche terminée', hint: '' };
    case 'gameOver':
      return { title: 'Partie terminée', hint: '' };
  }
}

export function GameClient({ code }: { code: string }) {
  const { identity, update, ready } = useIdentity();
  const { view, me, loading, error, busy, live, act } = useGame(code, identity?.playerId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [joining, setJoining] = useState(false);

  // Préférence de son lue dans le navigateur, donc après le montage.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMutedState(isMuted()), []);

  const run = useCallback(
    async (action: Parameters<typeof act>[0]) => {
      initAudio();
      cue('tap');
      const failure = await act(action);
      if (failure) setNotice(failure);
    },
    [act],
  );

  // Un message d'erreur ne doit pas rester collé à l'écran.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  // Entrée automatique dans la partie dès qu'on a un pseudo.
  useEffect(() => {
    if (!view || !identity?.name || me || joining) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoining(true);
    void act({ type: 'join', name: identity.name, emoji: identity.emoji }).then((failure) => {
      if (failure) setNotice(failure);
      setJoining(false);
    });
  }, [view, identity, me, joining, act]);

  if (!ready || loading) {
    return <Centered>Chargement…</Centered>;
  }
  if (error || !view) {
    return (
      <Centered>
        <p className="mb-4 text-ink-dim">{error ?? 'Partie introuvable.'}</p>
        <Link href="/" className="rounded-full bg-accent px-5 py-2.5 font-semibold text-felt-900">
          Retour
        </Link>
      </Centered>
    );
  }
  if (identity && !identity.name) {
    return <ProfileGate identity={identity} onSave={update} />;
  }

  const { title, hint } = prompt(view);
  const opponents = view.players.filter((p) => p.id !== view.you.id);
  const legal = new Set(view.legalActions);
  const myTurn = view.currentPlayerId === view.you.id;

  const isTarget = (index: number) => {
    if (!me) return false;
    const cell = me.grid[index];
    if (!cell) return false;
    if (legal.has('flipInitial')) return !cell.faceUp;
    if (legal.has('placeCard')) return true;
    if (legal.has('flipCard')) return !cell.faceUp;
    return false;
  };

  const onCell = (index: number) => {
    if (legal.has('flipInitial')) return void run({ type: 'flipInitial', index });
    if (legal.has('placeCard')) return void run({ type: 'placeCard', index });
    if (legal.has('flipCard')) return void run({ type: 'flipCard', index });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EventLayer view={view} />

      {/* Barre du haut */}
      <header className="safe-top flex items-center justify-between px-4 pb-2">
        <Link href="/" className="text-sm text-ink-faint" aria-label="Quitter">
          ←
        </Link>
        <div className="text-center">
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-ink-faint">
            {view.phase === 'lobby' ? 'salon' : `manche ${view.round}`} · objectif {view.targetScore}
          </div>
          <div className="font-mono text-sm font-bold tracking-[0.25em] text-accent">{view.code}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="text-sm text-ink-faint"
          aria-label="Réglages"
        >
          ⚙
        </button>
      </header>

      {showSettings && (
        <SettingsSheet
          muted={muted}
          live={live}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            setMutedState(next);
            if (!next) {
              initAudio();
              cue('tap');
            }
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {view.phase === 'lobby' ? (
        <Lobby view={view} onStart={() => void run({ type: 'startGame' })} busy={busy} />
      ) : (
        <>
          {/* Adversaires */}
          <div
            className={`flex gap-2 overflow-x-auto px-4 pb-1 ${opponents.length <= 2 ? 'justify-center' : ''}`}
          >
            {opponents.map((player) => (
              <PlayerPanel
                key={player.id}
                player={player}
                active={player.id === view.currentPlayerId}
                target={view.targetScore}
                closer={player.id === view.roundCloserId}
              />
            ))}
          </div>

          {/* Table */}
          <div className="shrink-0 py-2">
            <TableCenter
              drawPileCount={view.drawPileCount}
              discardTop={view.discardTop}
              heldCard={view.heldCard}
              heldFrom={view.heldFrom}
              heldByMe={myTurn}
              canDraw={legal.has('drawFromPile')}
              canTakeDiscard={legal.has('takeDiscard')}
              canDiscardHeld={legal.has('discardHeld')}
              onDraw={() => void run({ type: 'drawFromPile' })}
              onTakeDiscard={() => void run({ type: 'takeDiscard' })}
              onDiscardHeld={() => void run({ type: 'discardHeld' })}
            />
          </div>

          {/* Consigne */}
          <div className="shrink-0 px-4 text-center">
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-base font-bold ${myTurn || view.phase === 'initialFlip' ? 'text-accent' : 'text-ink-dim'}`}
            >
              {title}
            </motion.div>
            <div className="mt-0.5 text-[0.72rem] text-ink-faint">{hint}</div>
          </div>

          {/* Ma zone */}
          {me && (
            <div className="safe-bottom mx-auto flex min-h-0 w-full max-w-[24rem] flex-1 flex-col px-4 pt-2">
              <div className="mb-1.5 flex shrink-0 items-center gap-2">
                <Avatar player={me} active={myTurn} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{me.name}</div>
                  <div className="tnum text-[0.68rem] text-ink-dim">
                    {me.totalScore} pts · visible {me.visibleSum}
                    {me.faceDownCount > 0 && ` · ${me.faceDownCount} cachées`}
                  </div>
                </div>
                {view.roundCloserId === view.you.id && (
                  <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[0.62rem] font-bold text-danger">
                    tu as fermé
                  </span>
                )}
              </div>
              {/* Une grille 4×3 de cartes 3:4 est carrée : contraindre la hauteur
                  suffit donc à la faire tenir sur n'importe quel téléphone. */}
              <div className="flex min-h-0 flex-1 justify-center">
                <div className="aspect-square h-full max-h-full max-w-full" data-testid="my-grid">
                  <PlayerGrid
                    grid={me.grid}
                    size="lg"
                    isTarget={isTarget}
                    onCell={onCell}
                    layoutKey="me"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {view.phase === 'roundOver' && (
          <RoundSummary view={view} busy={busy} onNext={() => void run({ type: 'nextRound' })} />
        )}
        {view.phase === 'gameOver' && (
          <GameOverPanel view={view} busy={busy} onRestart={() => void run({ type: 'playAgain' })} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span className="rounded-full border border-danger/40 bg-danger/20 px-4 py-2 text-center text-[0.75rem] font-medium text-ink backdrop-blur-md">
              {notice}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-dvh place-items-center px-8 text-center text-sm text-ink-dim">
      <div>{children}</div>
    </div>
  );
}

function ProfileGate({
  identity,
  onSave,
}: {
  identity: { name: string; emoji: string };
  onSave: (patch: { name?: string; emoji?: string }) => void;
}) {
  const [name, setName] = useState(identity.name);
  const [emoji, setEmoji] = useState(identity.emoji);

  return (
    <div className="grid h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rise">
        <h1 className="text-center text-2xl font-black">Tu es qui ?</h1>
        <p className="mb-5 mt-1 text-center text-sm text-ink-dim">
          Juste un prénom et une bestiole, pas de compte.
        </p>

        <div className="mb-3 grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`aspect-square rounded-xl text-lg transition ${
                e === emoji ? 'bg-accent/25 ring-2 ring-accent' : 'bg-white/5 active:bg-white/10'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Prénom"
          maxLength={16}
          autoComplete="given-name"
          className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-center text-lg font-semibold outline-none placeholder:text-ink-faint focus:border-accent/60"
        />

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => {
            initAudio();
            onSave({ name: name.trim(), emoji });
          }}
          className="mt-3 w-full rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-40"
        >
          C’est parti
        </button>
      </div>
    </div>
  );
}

function Lobby({ view, onStart, busy }: { view: GameView; onStart: () => void; busy: boolean }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/r/${view.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Skyskouiki', text: `Rejoins ma partie : ${view.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // partage annulé
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">code de la partie</p>
        <p className="mt-1 font-mono text-5xl font-black tracking-[0.28em] text-accent">
          {view.code}
        </p>
      </div>

      <button
        type="button"
        onClick={share}
        className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-semibold active:scale-95"
      >
        {copied ? 'Lien copié ✓' : 'Partager le lien'}
      </button>

      <ul className="flex flex-wrap justify-center gap-2">
        {view.players.map((player) => (
          <motion.li
            key={player.id}
            layout
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 py-1.5 pl-2 pr-3.5"
          >
            <span className="text-lg" aria-hidden>
              {player.emoji}
            </span>
            <span className="text-sm font-semibold">{player.name}</span>
            {player.id === view.hostId && <span className="text-[0.6rem] text-ink-faint">hôte</span>}
          </motion.li>
        ))}
      </ul>

      {view.you.isHost ? (
        view.players.length < 2 ? (
          // Un bouton jaune grisé vire au brun : mieux vaut un état d'attente assumé.
          <p className="w-full max-w-xs rounded-2xl border border-dashed border-white/15 px-4 py-3.5 text-center text-sm text-ink-dim">
            En attente d’un joueur…
          </p>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="w-full max-w-xs rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-40"
          >
            Lancer la partie
          </button>
        )
      ) : (
        <p className="text-sm text-ink-dim">L’hôte lance la partie quand tout le monde est là.</p>
      )}

      <Link href="/regles" className="text-xs text-ink-faint underline underline-offset-4">
        Revoir les règles
      </Link>
    </div>
  );
}

function SettingsSheet({
  muted,
  live,
  onToggleMute,
  onClose,
}: {
  muted: boolean;
  live: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end p-4" onClick={onClose}>
      <div
        className="mt-14 w-52 rounded-2xl border border-white/12 bg-felt-800/95 p-2 shadow-2xl backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onToggleMute}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span>Sons</span>
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
        <Link
          href="/regles"
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span>Règles</span>
          <span>📖</span>
        </Link>
        <div className="flex items-center justify-between px-3 py-2 text-[0.68rem] text-ink-faint">
          <span>Temps réel</span>
          <span className={live ? 'text-good' : 'text-accent'}>{live ? 'connecté' : 'sondage'}</span>
        </div>
      </div>
    </div>
  );
}
