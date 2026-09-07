'use client';

import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

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

const RADIUS: Record<CardSize, string> = {
  xs: 'rounded-[3px]',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
};

/**
 * Pourquoi cette carte attire l'œil.
 *
 * `target` seul suffit quand tout est posable — mais pendant un échange, les
 * douze cases sont légales et se valent visuellement alors qu'elles ne se
 * valent pas du tout. `good` et `combo` remettent la hiérarchie que le joueur
 * ferait de tête.
 */
export type CardIntent = 'none' | 'target' | 'good' | 'combo';

const INTENT_CLASS: Record<CardIntent, string> = {
  none: '',
  target: 'is-target',
  good: 'is-good',
  combo: 'is-combo',
};

export interface PlayingCardProps {
  /** `null` quand la carte est face cachée : le client n'en connaît pas la valeur. */
  value: number | null;
  faceUp: boolean;
  size?: CardSize;
  /** Met la carte en avant : c'est une cible jouable, et pourquoi. */
  intent?: CardIntent;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** Coin supérieur droit : le solde d'un échange, un pictogramme de combo… */
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
  layoutId?: string;
  'aria-label'?: string;
}

export function PlayingCard({
  value,
  faceUp,
  size = 'md',
  intent = 'none',
  selected = false,
  dimmed = false,
  onClick,
  badge,
  className = '',
  style,
  layoutId,
  'aria-label': ariaLabel,
}: PlayingCardProps) {
  const tone = TONES[value === null ? 'navy' : toneOf(value)];
  const interactive = !!onClick;
  const ring = INTENT_CLASS[intent];
  const label = ariaLabel ?? (faceUp && value !== null ? `Carte ${value}` : 'Carte face cachée');

  const inner = (
    <>
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      >
        {/* Recto : la valeur */}
        <div
          className={[
            'card-face absolute inset-0 flex items-center justify-center [backface-visibility:hidden]',
            RADIUS[size],
            ring,
          ].join(' ')}
          style={{
            background: `linear-gradient(160deg, ${tone.from} 0%, ${tone.to} 100%)`,
            boxShadow: `inset 0 1px 0 ${tone.edge}, inset 0 -2px 6px rgb(0 0 0 / 0.28), 0 2px 6px rgb(0 0 0 / 0.4)`,
            color: tone.ink,
          }}
        >
          <span className="tnum card-numeral font-black leading-none tracking-tight">{value}</span>
        </div>

        {/* Verso : le dos de carte */}
        <div
          className={[
            'card-face absolute inset-0 flex items-center justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]',
            RADIUS[size],
            ring,
          ].join(' ')}
          style={{
            background:
              'repeating-linear-gradient(135deg, #2a1a55 0 4px, #221546 4px 8px), radial-gradient(circle at 50% 40%, #3b2470, #1a1035)',
            boxShadow:
              'inset 0 1px 0 rgb(255 255 255 / 0.14), inset 0 -2px 6px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.4)',
          }}
        >
          <span className="card-pip leading-none opacity-50" aria-hidden>
            ✦
          </span>
        </div>
      </motion.div>

      {/* Hors du conteneur 3D : une pastille collée au dos partirait en miroir. */}
      {badge}
    </>
  );

  const shared = {
    layoutId,
    className: [
      'relative block aspect-[3/4] w-full [perspective:900px]',
      // La pastille déborde du coin : sans ça, la carte voisine la recouvre.
      badge ? 'z-20' : '',
      interactive ? 'cursor-pointer' : '',
      dimmed ? 'opacity-40' : '',
      className,
    ].join(' '),
    style,
    animate: { scale: selected ? 1.06 : 1 },
    transition: { type: 'spring', stiffness: 420, damping: 26 } as const,
  };

  // Une carte qu'on ne peut pas jouer n'est pas un bouton : les grilles adverses
  // en alignent douze, et douze boutons désactivés encombrent autant le lecteur
  // d'écran que le HTML — la vignette d'un adversaire est elle-même un bouton,
  // qui n'a pas le droit d'en contenir.
  if (!interactive) {
    return (
      <motion.div {...shared} role="img" aria-label={label}>
        {inner}
      </motion.div>
    );
  }

  return (
    <motion.button {...shared} type="button" onClick={onClick} aria-label={label} whileTap={{ scale: 0.93 }}>
      {inner}
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
