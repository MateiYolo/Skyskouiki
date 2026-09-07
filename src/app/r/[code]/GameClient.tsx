'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { ActionDock } from '@/components/ActionDock';
import { EventLayer } from '@/components/EventLayer';
import { MyBoard } from '@/components/MyBoard';
import { OpponentSheet, OpponentStrip } from '@/components/OpponentStrip';
import { GameOverPanel, RoundSummary } from '@/components/Overlays';
import { EMOJIS, useIdentity } from '@/lib/client/identity';
import { cue, initAudio, isMuted, setMuted } from '@/lib/client/feedback';
import { useGame } from '@/lib/client/useGame';
import { heldSummary, lastMove } from '@/lib/skyjo';
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
          ? { title: 'Échange-la, ou jette-la', hint: 'Tape une de tes cartes — ou la défausse pour t’en débarrasser.' }
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
  const [inspecting, setInspecting] = useState<string | null>(null);

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
  const move = lastMove(view);
  const held = heldSummary(view);
  // Résolu au rendu : un joueur qui quitte referme sa fiche de lui-même.
  const inspected = opponents.find((p) => p.id === inspecting) ?? null;

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
        {/* Le code n'a plus rien à faire ici une fois tout le monde entré : il
            vit dans le salon, puis dans le menu ⚙ pour le retardataire. */}
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-ink-faint">
          {view.phase === 'lobby' ? 'salon' : `manche ${view.round}`} · objectif {view.targetScore}
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
          code={view.code}
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
          <OpponentStrip view={view} opponents={opponents} move={move} onOpen={setInspecting} />

          {me && (
            <MyBoard
              view={view}
              me={me}
              myTurn={myTurn}
              isTarget={isTarget}
              onCell={onCell}
            />
          )}

          {/* Consigne et piles réunies en bas, à portée de pouce. */}
          <ActionDock
            title={title}
            hint={hint}
            emphasis={myTurn || view.phase === 'initialFlip'}
            drawPileCount={view.drawPileCount}
            discardTop={view.discardTop}
            heldCard={view.heldCard}
            heldFrom={view.heldFrom}
            heldNote={held?.text ?? null}
            canDraw={legal.has('drawFromPile')}
            canTakeDiscard={legal.has('takeDiscard')}
            canDiscardHeld={legal.has('discardHeld')}
            onDraw={() => void run({ type: 'drawFromPile' })}
            onTakeDiscard={() => void run({ type: 'takeDiscard' })}
            onDiscardHeld={() => void run({ type: 'discardHeld' })}
          />
        </>
      )}

      {/* Mon tour : un liseré qui respire sur tout le pourtour. Il ne masque
          rien et ne se rate pas, même le téléphone posé à côté de l'assiette. */}
      {myTurn && view.phase === 'playing' && (
        <div className="turn-glow pointer-events-none fixed inset-0 z-30" aria-hidden />
      )}

      <AnimatePresence>
        {inspected && (
          <OpponentSheet
            player={inspected}
            active={inspected.id === view.currentPlayerId}
            closer={inspected.id === view.roundCloserId}
            target={view.targetScore}
            onClose={() => setInspecting(null)}
          />
        )}
      </AnimatePresence>

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

/**
 * Partage le lien de la partie. Renvoie `true` quand il a fallu se rabattre sur
 * le presse-papiers, pour que l'appelant puisse le dire à l'écran.
 */
async function shareGame(code: string): Promise<boolean> {
  const url = `${window.location.origin}/r/${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Skyskouiki', text: `Rejoins ma partie : ${code}`, url });
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false; // partage annulé
  }
}

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
    if (!(await shareGame(view.code))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">code de la partie</p>
        <p className="tnum mt-1 text-5xl font-black tracking-[0.24em] text-accent">
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
  code,
  muted,
  live,
  onToggleMute,
  onClose,
}: {
  code: string;
  muted: boolean;
  live: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end p-4" onClick={onClose}>
      <div
        className="mt-14 w-56 rounded-2xl border border-white/12 bg-felt-800/95 p-2 shadow-2xl backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sorti de l'écran de jeu, le code reste à un tap : c'est là qu'on le
            cherche quand quelqu'un arrive en retard. */}
        <button
          type="button"
          onClick={() => void shareGame(code)}
          className="mb-1 flex w-full items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span className="text-ink-dim">Code</span>
          <span className="tnum font-bold tracking-[0.2em] text-accent">{code}</span>
        </button>
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
