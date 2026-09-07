'use client';

import { AnimatePresence, motion } from 'motion/react';
import { EmptySlot, PlayingCard, type CardIntent, type CardSize } from './PlayingCard';
import type { ViewCell } from '@/lib/skyjo';

/** Ce qu'on annonce sur une case avant que le joueur la touche. */
export interface CellCue {
  intent: CardIntent;
  /** Solde du score si la carte tenue atterrit là. `null` = case cachée, donc inconnu. */
  delta?: number | null;
  /** Le placement fait sauter une colonne ou une ligne. */
  combo?: boolean;
}

export interface PlayerGridProps {
  grid: ViewCell[];
  size?: CardSize;
  /** Index sur lesquels le joueur peut agir maintenant. */
  isTarget?: (index: number) => boolean;
  /** Ce qu'on annonce sur chaque case jouable. */
  cueFor?: (index: number) => CellCue | null;
  onCell?: (index: number) => void;
  /** Identifiant du joueur : sert aux transitions partagées entre la main et la grille. */
  layoutKey?: string;
}

/** Pastille de solde : « −7 » se lit plus vite que « tu passes de 9 à 2 ». */
function DeltaBadge({ delta, combo }: { delta: number | null | undefined; combo?: boolean }) {
  if (combo) {
    return (
      <span className="pointer-events-none absolute right-0.5 top-0.5 z-10 rounded-full bg-accent px-1.5 py-px text-[0.6rem] font-black leading-tight text-felt-900 shadow-lg">
        ✦
      </span>
    );
  }
  // Une case cachée reste un pari : le dos de la carte le dit déjà, et huit
  // pastilles « ? » n'ajouteraient que du bruit là où il faut lire vite.
  if (delta === undefined || delta === null) return null;

  return (
    <span
      className={[
        // À l'intérieur de la carte, pas en débord : deux cases voisines ont la
        // même profondeur, et une pastille qui dépassait passait sous la carte
        // suivante — pile pendant l'échange, quand on la lit le plus.
        'pointer-events-none tnum absolute right-0.5 top-0.5 z-10 rounded-full px-1.5 py-px text-[0.6rem] font-bold leading-tight shadow-lg',
        // Un échange à somme nulle n'est ni une bonne ni une mauvaise idée :
        // le peindre en rouge découragerait un coup parfaitement neutre.
        delta < 0 ? 'bg-good text-felt-900' : delta === 0 ? 'bg-white/30 text-ink' : 'bg-danger text-white',
      ].join(' ')}
    >
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

/** La grille 4 × 3 d'un joueur. Une case vide est une colonne déjà éliminée. */
export function PlayerGrid({
  grid,
  size = 'md',
  isTarget,
  cueFor,
  onCell,
  layoutKey,
}: PlayerGridProps) {
  const gap = size === 'xs' ? 'gap-[2px]' : size === 'sm' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`grid h-full grid-cols-4 grid-rows-3 ${gap}`}>
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
        const cue = target ? (cueFor?.(index) ?? null) : null;
        const label = cell.faceUp
          ? `Carte ${cell.value}${cue?.delta != null ? `, échange ${cue.delta > 0 ? '+' : ''}${cue.delta} points` : ''}${cue?.combo ? ', complète un groupe' : ''}`
          : `Carte face cachée${cue?.combo ? ', complète un groupe' : ''}`;

        return (
          <PlayingCard
            key={index}
            layoutId={layoutKey ? `${layoutKey}-${index}` : undefined}
            value={cell.faceUp ? cell.value : null}
            faceUp={cell.faceUp}
            size={size}
            intent={cue?.intent ?? (target ? 'target' : 'none')}
            badge={cue ? <DeltaBadge delta={cue.delta} combo={cue.combo} /> : undefined}
            onClick={target && onCell ? () => onCell(index) : undefined}
            aria-label={label}
          />
        );
      })}
    </div>
  );
}
