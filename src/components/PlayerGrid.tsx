'use client';

import { motion } from 'motion/react';
import { EmptySlot, PlayingCard, type CardSize } from './PlayingCard';
import { cellAnchor } from '@/lib/client/flights';
import { SETTLE } from '@/lib/client/motion';
import type { ViewCell } from '@/lib/skyjo';

/**
 * La grille 4 × 3 d'un joueur — la mienne en grand, celle des autres en petit.
 *
 * Elle porte deux échos du dernier coup, et rien d'autre. Sans eux, une partie
 * à distance est une suite d'états : la grille d'en face a changé, on ne sait
 * ni où ni comment. Avec eux, on voit le coup se produire :
 *
 *   - `touched` cercle la case qui vient d'être jouée, puis s'efface ;
 *   - `cleared` rejoue la disparition d'un groupe — les cartes sont déjà
 *     parties de l'état, on les remontre une demi-seconde pour qu'on voie
 *     *lesquelles* et *pourquoi*.
 *
 * `echoKey` (la version de la partie) sert de clé : chaque coup remonte des
 * calques neufs, donc rejoue l'animation, même deux fois de suite au même
 * endroit.
 */

/** Le groupe qui vient de sauter chez ce joueur. */
export interface ClearEcho {
  indices: number[];
  value: number;
}

export interface PlayerGridProps {
  grid: ViewCell[];
  size?: CardSize;
  /** Index sur lesquels le joueur peut agir maintenant. */
  isTarget?: (index: number) => boolean;
  /**
   * Entoure les cases jouables. À couper quand *toutes* le sont : un liseré
   * partout ne désigne rien et rend la grille illisible au moment précis où il
   * faut la lire.
   */
  markTargets?: boolean;
  onCell?: (index: number) => void;
  /** Case jouée au dernier coup. */
  touched?: number | null;
  /** Groupe éliminé au dernier coup. */
  cleared?: ClearEcho | null;
  /** Version de la partie : remonte les échos à chaque nouveau coup. */
  echoKey?: number;
  /**
   * Cases que le joueur vient de toucher et dont la valeur n'est pas encore
   * arrivée : elles se retournent tout de suite et attendent sur une face
   * neutre. Un tableau, parce qu'on peut en enchaîner deux plus vite que le
   * serveur ne répond.
   */
  revealing?: readonly number[];
  /** Identifiant du joueur : nomme chaque case pour la couche de vol. */
  playerId?: string;
}

/** Le coup qui vient d'être joué : un liseré qui s'allume et s'éteint tout seul. */
function TouchedRing({ radius }: { radius: string }) {
  return (
    <motion.span
      className={`pointer-events-none absolute -inset-[3px] ${radius}`}
      style={{ boxShadow: '0 0 0 2px var(--color-accent), 0 0 16px rgb(255 204 77 / 0.5)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.5, times: [0, 0.08, 0.55, 1], ease: 'linear' }}
    />
  );
}

/**
 * Le groupe qui saute. La carte reste en place le temps qu'on l'identifie, puis
 * s'en va vers le haut en se réduisant — le trou qu'elle laisse est déjà là,
 * dessous.
 */
function ClearGhost({ value, size }: { value: number; size: CardSize }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10"
      initial={{ opacity: 1, scale: 1, y: 0 }}
      animate={{ opacity: 0, scale: 0.6, y: -14 }}
      transition={{ ...SETTLE, delay: 0.35 }}
    >
      <PlayingCard value={value} faceUp size={size} intent="target" />
    </motion.div>
  );
}

/** La grille 4 × 3 d'un joueur. Une case vide est une colonne déjà éliminée. */
export function PlayerGrid({
  grid,
  size = 'md',
  isTarget,
  markTargets = true,
  onCell,
  touched = null,
  cleared = null,
  echoKey = 0,
  revealing,
  playerId,
}: PlayerGridProps) {
  const gap = size === 'xs' ? 'gap-[2px]' : size === 'sm' ? 'gap-1' : 'gap-1.5';
  const radius = size === 'xs' ? 'rounded-[4px]' : size === 'sm' ? 'rounded-lg' : 'rounded-xl';
  const clearing = cleared ? new Set(cleared.indices) : null;

  return (
    <div className={`grid h-full grid-cols-4 grid-rows-3 ${gap}`}>
      {grid.map((cell, index) => {
        if (cell === null) {
          return (
            <div
              key={index}
              data-anchor={playerId ? cellAnchor(playerId, index) : undefined}
              className="relative"
            >
              <EmptySlot size={size} />
              {clearing?.has(index) && (
                <ClearGhost key={echoKey} value={cleared!.value} size={size} />
              )}
            </div>
          );
        }

        const target = isTarget?.(index) ?? false;
        const turning = revealing?.includes(index) ?? false;
        const label = cell.faceUp ? `Carte ${cell.value}` : 'Carte face cachée';

        return (
          <PlayingCard
            key={index}
            data-anchor={playerId ? cellAnchor(playerId, index) : undefined}
            value={cell.faceUp ? cell.value : null}
            faceUp={cell.faceUp || turning}
            size={size}
            intent={target && markTargets ? 'target' : 'none'}
            overlay={touched === index ? <TouchedRing key={echoKey} radius={radius} /> : undefined}
            onClick={target && onCell ? () => onCell(index) : undefined}
            aria-label={label}
          />
        );
      })}
    </div>
  );
}
