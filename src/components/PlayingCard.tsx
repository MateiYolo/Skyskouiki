'use client';

import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { MOVE, SNAP } from '@/lib/client/motion';

/**
 * Une carte Skyjo.
 *
 * Le code couleur est celui du jeu physique — bleu foncé pour les négatives,
 * cyan pour le zéro, puis vert / jaune / rouge à mesure que ça fait mal. C'est
 * ce qui permet de lire une grille adverse d'un coup d'œil, sans lire un chiffre.
 */

export type Tone = 'navy' | 'sky' | 'green' | 'yellow' | 'red' | 'blank';

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
  // Retournée, mais pas encore lue : la carte a bougé au doigt, sa valeur
  // arrive du serveur. Une face neutre le dit sans rien inventer.
  blank: { from: '#57497e', to: '#332a55', ink: '#ffffff', edge: '#7b6bab' },
};

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const RADIUS: Record<CardSize, string> = {
  xs: 'rounded-[3px]',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
};

/**
 * Un seul état d'appel : cette carte-ci attend d'être touchée.
 *
 * Il n'y a pas d'échelle de « bon coup » : annoncer le solde d'un échange
 * chiffre par chiffre transformait la grille en tableur, et le joueur lisait
 * les pastilles au lieu de ses cartes. Le calcul lui revient — c'est le jeu.
 */
export type CardIntent = 'none' | 'target';

const INTENT_CLASS: Record<CardIntent, string> = {
  none: '',
  target: 'is-target',
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
  /** Calque posé par-dessus la carte : le liseré du coup qui vient d'être joué. */
  overlay?: ReactNode;
  /** Épouse son conteneur au lieu d'imposer son ratio : pour une carte en vol. */
  fill?: boolean;
  /** Emplacement nommé, mesuré par la couche de vol. */
  'data-anchor'?: string;
  className?: string;
  style?: CSSProperties;
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
  overlay,
  fill = false,
  className = '',
  style,
  'aria-label': ariaLabel,
  'data-anchor': anchor,
}: PlayingCardProps) {
  const tone = TONES[value === null ? (faceUp ? 'blank' : 'navy') : toneOf(value)];
  const interactive = !!onClick;
  const ring = INTENT_CLASS[intent];
  const label = ariaLabel ?? (faceUp && value !== null ? `Carte ${value}` : 'Carte face cachée');

  const inner = (
    <>
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={MOVE}
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
            // La face neutre prend sa couleur quand la valeur arrive : le
            // raccord se fait en fondu plutôt qu'en sautant d'un ton à l'autre.
            transition: 'background 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
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

      {/* Hors du conteneur 3D : un calque collé au dos partirait en miroir. */}
      {overlay}
    </>
  );

  const shared = {
    'data-anchor': anchor,
    className: [
      'relative block [perspective:900px]',
      fill ? 'h-full w-full' : 'aspect-[3/4] w-full',
      interactive ? 'cursor-pointer' : '',
      dimmed ? 'opacity-40' : '',
      className,
    ].join(' '),
    style,
    animate: { scale: selected ? 1.04 : 1 },
    transition: SNAP,
  };

  /**
   * Toujours le même élément, jouable ou non.
   *
   * Alterner entre `<button>` et `<div>` selon qu'une case est une cible
   * paraissait plus propre, mais React voyait deux types différents : à chaque
   * changement de tour, les douze cartes étaient démontées puis remontées. Le
   * retournement ne s'animait donc jamais — la carte sautait d'un état à
   * l'autre, ce qui se lit comme une latence alors que c'est un clignotement.
   *
   * Reste la raison d'origine de ne pas tout mettre en boutons : une grille
   * adverse en aligne douze, injouables, et la vignette qui les contient est
   * elle-même un bouton. Ce n'est donc pas l'élément qui change, mais son rôle.
   */
  /**
   * Au contact, pas au relâchement.
   *
   * Entre le doigt qui touche et l'événement `click`, il y a toute la durée du
   * geste — souvent plus de cent millisecondes, et c'est du temps pendant
   * lequel l'écran ne dit rien. Rien ici ne défile ni ne se glisse : un contact
   * sur une carte jouable ne peut vouloir dire qu'une chose.
   */
  const press = (event: { button?: number; isPrimary?: boolean }) => {
    if (!interactive) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.isPrimary === false) return;
    onClick!();
  };

  return (
    <motion.div
      {...shared}
      role={interactive ? 'button' : 'img'}
      aria-label={label}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={interactive ? press : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                press({});
              }
            }
          : undefined
      }
      whileTap={interactive ? { scale: 0.96 } : undefined}
    >
      {inner}
    </motion.div>
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
