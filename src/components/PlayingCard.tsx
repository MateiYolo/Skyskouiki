'use client';

import { motion } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * Une carte Skyjo.
 *
 * Le code couleur est celui du jeu physique — bleu foncé pour les négatives,
 * cyan pour le zéro, puis vert / jaune / rouge à mesure que ça fait mal. C'est
 * ce qui permet de lire une grille adverse d'un coup d'œil, sans lire un chiffre.
 */

export type Tone = 'navy' | 'sky' | 'green' | 'yellow' | 'red';

export function toneOf(value: number): Tone {
  if (value < 0) return 'navy';
  if (value === 0) return 'sky';
  if (value <= 4) return 'green';
  if (value <= 8) return 'yellow';
  return 'red';
}

const TONES: Record<Tone, { from: string; to: string; ink: string; edge: string }> = {
  navy: { from: '#2f5bd0', to: '#132b73', ink: '#ffffff', edge: '#5d86e8' },
  sky: { from: '#6fd6ff', to: '#1e9fd8', ink: '#052a3d', edge: '#a5e8ff' },
  green: { from: '#6ed673', to: '#2f9138', ink: '#06280a', edge: '#a2eda6' },
  yellow: { from: '#ffdc5e', to: '#e0a908', ink: '#3d2b00', edge: '#ffeda1' },
  red: { from: '#ff7070', to: '#c22626', ink: '#ffffff', edge: '#ffa8a8' },
};

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const NUMERAL: Record<CardSize, string> = {
  xs: 'text-[0.7rem]',
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-[2rem]',
};

const RADIUS: Record<CardSize, string> = {
  xs: 'rounded-[4px]',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
};

export interface PlayingCardProps {
  /** `null` quand la carte est face cachée : le client n'en connaît pas la valeur. */
  value: number | null;
  faceUp: boolean;
  size?: CardSize;
  /** Met la carte en avant : c'est une cible jouable. */
  target?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  layoutId?: string;
}

export function PlayingCard({
  value,
  faceUp,
  size = 'md',
  target = false,
  selected = false,
  dimmed = false,
  onClick,
  className = '',
  style,
  layoutId,
}: PlayingCardProps) {
  const tone = TONES[value === null ? 'navy' : toneOf(value)];
  const interactive = !!onClick;

  return (
    <motion.button
      type="button"
      layoutId={layoutId}
      disabled={!interactive}
      onClick={onClick}
      aria-label={faceUp && value !== null ? `Carte ${value}` : 'Carte face cachée'}
      className={[
        'relative block aspect-[3/4] w-full [perspective:900px]',
        interactive ? 'cursor-pointer' : 'cursor-default',
        dimmed ? 'opacity-45' : '',
        className,
      ].join(' ')}
      style={style}
      whileTap={interactive ? { scale: 0.93 } : undefined}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      >
        {/* Recto : la valeur */}
        <div
          className={[
            'absolute inset-0 flex items-center justify-center [backface-visibility:hidden]',
            RADIUS[size],
            target ? 'is-target' : '',
          ].join(' ')}
          style={{
            background: `linear-gradient(160deg, ${tone.from} 0%, ${tone.to} 100%)`,
            boxShadow: `inset 0 1px 0 ${tone.edge}, inset 0 -2px 6px rgb(0 0 0 / 0.28), 0 2px 6px rgb(0 0 0 / 0.4)`,
            color: tone.ink,
          }}
        >
          <span className={`tnum font-black leading-none tracking-tight ${NUMERAL[size]}`}>
            {value}
          </span>
        </div>

        {/* Verso : le dos de carte */}
        <div
          className={[
            'absolute inset-0 flex items-center justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]',
            RADIUS[size],
            target ? 'is-target' : '',
          ].join(' ')}
          style={{
            background:
              'repeating-linear-gradient(135deg, #2a1a55 0 4px, #221546 4px 8px), radial-gradient(circle at 50% 40%, #3b2470, #1a1035)',
            boxShadow:
              'inset 0 1px 0 rgb(255 255 255 / 0.14), inset 0 -2px 6px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.4)',
          }}
        >
          <span
            className={`${size === 'xs' ? 'text-[0.55rem]' : size === 'sm' ? 'text-xs' : 'text-lg'} opacity-60`}
            aria-hidden
          >
            ✦
          </span>
        </div>
      </motion.div>
    </motion.button>
  );
}

/** Emplacement vide : une colonne éliminée laisse un trou, pas une carte. */
export function EmptySlot({ size = 'md' }: { size?: CardSize }) {
  return (
    <div
      className={`aspect-[3/4] w-full border border-dashed border-white/12 bg-white/[0.03] ${RADIUS[size]}`}
      aria-label="Emplacement vidé"
    />
  );
}
