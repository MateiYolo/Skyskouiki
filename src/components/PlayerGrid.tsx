'use client';

import { AnimatePresence, motion } from 'motion/react';
import { EmptySlot, PlayingCard, type CardSize } from './PlayingCard';
import type { ViewCell } from '@/lib/skyjo';

export interface PlayerGridProps {
  grid: ViewCell[];
  size?: CardSize;
  /** Index sur lesquels le joueur peut agir maintenant. */
  isTarget?: (index: number) => boolean;
  onCell?: (index: number) => void;
  /** Identifiant du joueur : sert aux transitions partagées entre la main et la grille. */
  layoutKey?: string;
}

/** La grille 4 × 3 d'un joueur. Une case vide est une colonne déjà éliminée. */
export function PlayerGrid({ grid, size = 'md', isTarget, onCell, layoutKey }: PlayerGridProps) {
  const gap = size === 'xs' ? 'gap-[3px]' : size === 'sm' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`grid grid-cols-4 ${gap}`}>
      {grid.map((cell, index) => {
        if (cell === null) {
          return (
            <AnimatePresence key={index} mode="popLayout">
              <motion.div
                initial={{ scale: 1.25, opacity: 0.9 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <EmptySlot size={size} />
              </motion.div>
            </AnimatePresence>
          );
        }

        const target = isTarget?.(index) ?? false;
        return (
          <PlayingCard
            key={index}
            layoutId={layoutKey ? `${layoutKey}-${index}` : undefined}
            value={cell.faceUp ? cell.value : null}
            faceUp={cell.faceUp}
            size={size}
            target={target}
            onClick={target && onCell ? () => onCell(index) : undefined}
          />
        );
      })}
    </div>
  );
}
