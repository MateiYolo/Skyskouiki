'use client';

import { motion } from 'motion/react';
import { PlayerGrid } from './PlayerGrid';
import type { ViewPlayer } from '@/lib/skyjo';

/** Jauge de danger : on ne veut surtout pas la remplir. */
export function ScoreMeter({ score, target }: { score: number; target: number }) {
  const ratio = Math.max(0, Math.min(1, score / target));
  const hot = ratio > 0.75;

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full"
        style={{
          background: hot
            ? 'linear-gradient(90deg, #ffb347, #ff5a5f)'
            : 'linear-gradient(90deg, #4ade80, #ffcc4d)',
        }}
        initial={false}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      />
    </div>
  );
}

export function Avatar({
  player,
  active,
  size = 'md',
}: {
  player: ViewPlayer;
  active: boolean;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-base' : 'h-10 w-10 text-xl';
  return (
    <motion.div
      className={`relative grid ${dim} shrink-0 place-items-center rounded-full bg-white/10`}
      animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={active ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={
        active
          ? { boxShadow: '0 0 0 2px var(--color-accent), 0 0 18px rgb(255 204 77 / 0.45)' }
          : undefined
      }
    >
      <span aria-hidden>{player.emoji}</span>
      {!player.connected && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white/40 ring-2 ring-felt-900"
          title="Déconnecté"
        />
      )}
    </motion.div>
  );
}

export interface PlayerPanelProps {
  player: ViewPlayer;
  active: boolean;
  target: number;
  /** Le joueur qui a fermé la manche : on le signale, c'est lui qui risque le doublement. */
  closer?: boolean;
}

/** Vignette d'un adversaire : sa grille en miniature et où il en est. */
export function PlayerPanel({ player, active, target, closer }: PlayerPanelProps) {
  return (
    <div
      className={[
        'w-[8.5rem] shrink-0 rounded-2xl border p-2.5 transition-colors',
        active ? 'border-accent/50 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center gap-2">
        <Avatar player={player} active={active} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.7rem] font-semibold text-ink">{player.name}</div>
          <div className="tnum text-[0.65rem] text-ink-dim">{player.totalScore} pts</div>
        </div>
      </div>

      <PlayerGrid grid={player.grid} size="xs" />

      <div className="mt-2 space-y-1">
        <ScoreMeter score={player.totalScore} target={target} />
        <div className="flex items-center justify-between text-[0.6rem] text-ink-faint">
          <span className="tnum">visible&nbsp;{player.visibleSum}</span>
          {closer ? (
            <span className="font-semibold text-danger">a fermé</span>
          ) : (
            <span className="tnum">{player.faceDownCount} cachées</span>
          )}
        </div>
      </div>
    </div>
  );
}
