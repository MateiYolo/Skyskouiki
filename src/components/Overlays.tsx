'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Confetti } from './Confetti';
import { ScoreMeter } from './PlayerPanel';
import type { GameView, RoundScore } from '@/lib/skyjo';

/** Compteur qui monte : un score qui s'incrémente se regarde, un score affiché non. */
function CountUp({ to, duration = 700 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic : ça freine à l'arrivée, comme un compteur mécanique.
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(origin + (to - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration]);

  return <span className="tnum">{value}</span>;
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-felt-900/80 backdrop-blur-md sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="safe-bottom w-full max-w-md rounded-t-3xl border border-white/12 bg-felt-800/95 p-5 shadow-2xl sm:rounded-3xl"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function ScoreRows({ view, scores }: { view: GameView; scores: RoundScore[] }) {
  const ordered = [...scores].sort((a, b) => a.final - b.final);

  return (
    <ul className="space-y-2">
      {ordered.map((score, rank) => {
        const player = view.players.find((p) => p.id === score.playerId);
        if (!player) return null;
        const isMe = player.id === view.you.id;

        return (
          <motion.li
            key={score.playerId}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 * rank, type: 'spring', stiffness: 300, damping: 24 }}
            className={[
              'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
              isMe ? 'border-accent/40 bg-accent/10' : 'border-white/10 bg-white/[0.04]',
            ].join(' ')}
          >
            <span className="text-xl" aria-hidden>
              {player.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{player.name}</span>
                {score.closedRound && (
                  <span className="rounded-full bg-white/12 px-1.5 py-px text-[0.6rem] text-ink-dim">
                    a fermé
                  </span>
                )}
              </div>
              <ScoreMeter score={player.totalScore} target={view.targetScore} />
            </div>

            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1.5">
                {score.doubled && (
                  <motion.span
                    className="rounded-md bg-danger/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-danger"
                    initial={{ scale: 0, rotate: -18 }}
                    animate={{ scale: 1, rotate: -8 }}
                    transition={{ delay: 0.3 + 0.12 * rank, type: 'spring', stiffness: 400, damping: 12 }}
                  >
                    ×2
                  </motion.span>
                )}
                <span
                  className={`tnum text-lg font-bold ${score.doubled ? 'text-danger' : 'text-ink'}`}
                >
                  {score.final > 0 ? '+' : ''}
                  {score.final}
                </span>
              </div>
              <div className="tnum text-[0.7rem] text-ink-dim">
                total <CountUp to={player.totalScore} />
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

export function RoundSummary({
  view,
  onNext,
  busy,
}: {
  view: GameView;
  onNext: () => void;
  busy: boolean;
}) {
  const scores = view.lastRoundScores ?? [];
  const mine = scores.find((s) => s.playerId === view.you.id);

  return (
    <Sheet>
      <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
        Manche {view.round} terminée
      </h2>
      <p className="mb-4 mt-1 text-center text-lg font-bold">
        {mine?.doubled
          ? 'Aïe. Fermeture ratée, score doublé.'
          : mine && mine.final <= 0
            ? 'Manche parfaite 🧊'
            : 'On compte les dégâts'}
      </p>

      <ScoreRows view={view} scores={scores} />

      <button
        type="button"
        onClick={onNext}
        disabled={busy}
        className="mt-5 w-full rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-50"
      >
        Manche suivante
      </button>
      <p className="mt-2 text-center text-[0.68rem] text-ink-faint">
        La partie s’arrête dès que quelqu’un atteint {view.targetScore} points.
      </p>
    </Sheet>
  );
}

export function GameOverPanel({
  view,
  onRestart,
  busy,
}: {
  view: GameView;
  onRestart: () => void;
  busy: boolean;
}) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const iWon = view.winnerId === view.you.id;
  const standings = [...view.players].sort((a, b) => a.totalScore - b.totalScore);

  return (
    <>
      {iWon && <Confetti />}
      <Sheet>
        <div className="mb-4 text-center">
          <motion.div
            className="text-5xl"
            initial={{ scale: 0.4, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
            aria-hidden
          >
            {iWon ? '🏆' : winner?.emoji}
          </motion.div>
          <h2 className="mt-2 text-2xl font-black">
            {iWon ? 'Tu gagnes !' : `${winner?.name} gagne`}
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            {iWon ? 'Le plus petit score l’emporte. Bien joué.' : 'La revanche est juste en dessous.'}
          </p>
        </div>

        <ul className="space-y-1.5">
          {standings.map((player, rank) => (
            <li
              key={player.id}
              className={[
                'flex items-center gap-3 rounded-xl border px-3 py-2',
                rank === 0 ? 'border-accent/50 bg-accent/10' : 'border-white/10 bg-white/[0.04]',
              ].join(' ')}
            >
              <span className="tnum w-5 text-sm font-bold text-ink-faint">{rank + 1}</span>
              <span className="text-lg" aria-hidden>
                {player.emoji}
              </span>
              <span className="flex-1 truncate text-sm font-semibold">{player.name}</span>
              <span className="tnum text-lg font-bold">{player.totalScore}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onRestart}
          disabled={busy}
          className="mt-5 w-full rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-50"
        >
          Revanche
        </button>
      </Sheet>
    </>
  );
}
