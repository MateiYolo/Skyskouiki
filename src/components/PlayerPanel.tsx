'use client';

import { motion } from 'motion/react';
import { MOVE } from '@/lib/client/motion';
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
        transition={MOVE}
      />
    </div>
  );
}

/**
 * Les deux seuls chiffres qui comptent, côte à côte et lisibles de loin.
 *
 * « manche » est le total des cartes déjà retournées : ce qu'on encaisserait si
 * la manche s'arrêtait maintenant, le compte qu'on surveille à chaque échange.
 * « total » est le cumul de la partie, celui qui décide qui perd. Les compter
 * dans une ligne de texte fin les rendait invisibles ; ici ils ont la taille de
 * leur importance, et le total vire au rouge à l'approche du seuil.
 */
export function ScoreTiles({
  round,
  total,
  target,
  size = 'md',
}: {
  round: number;
  total: number;
  target: number;
  size?: 'sm' | 'md';
}) {
  const hot = total >= target * 0.75;
  const num = size === 'sm' ? 'text-[0.95rem]' : 'text-[1.15rem]';
  const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <div className="flex shrink-0 items-stretch gap-1">
      <Tile label="manche" value={round} num={num} pad={pad} className="bg-white/[0.07] text-ink" />
      <Tile
        label="total"
        value={total}
        num={num}
        pad={pad}
        className={hot ? 'bg-danger/20 text-danger' : 'bg-accent/15 text-accent'}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  num,
  pad,
  className,
}: {
  label: string;
  value: number;
  num: string;
  pad: string;
  className: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl ${pad} ${className}`}>
      <span className="text-[0.5rem] font-semibold uppercase leading-none tracking-[0.12em] opacity-70">
        {label}
      </span>
      <span className={`tnum font-black leading-tight ${num}`}>{value}</span>
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
  // « C'est son tour » est un état, pas un événement : un anneau fixe le dit
  // aussi bien qu'une pastille qui bat, sans tirer l'œil en permanence.
  return (
    <div
      className={`relative grid ${dim} shrink-0 place-items-center rounded-full bg-white/10`}
      style={
        active
          ? { boxShadow: '0 0 0 2px var(--color-accent), 0 0 16px rgb(255 204 77 / 0.4)' }
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
    </div>
  );
}
