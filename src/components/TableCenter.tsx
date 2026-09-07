'use client';

import { AnimatePresence, motion } from 'motion/react';
import { PlayingCard } from './PlayingCard';

export interface TableCenterProps {
  drawPileCount: number;
  discardTop: number | null;
  heldCard: number | null;
  heldFrom: 'draw' | 'discard' | null;
  /** Vrai si c'est le joueur local qui tient la carte (sinon on montre juste un dos). */
  heldByMe: boolean;
  canDraw: boolean;
  canTakeDiscard: boolean;
  canDiscardHeld: boolean;
  onDraw: () => void;
  onTakeDiscard: () => void;
  onDiscardHeld: () => void;
}

function PileLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </span>
  );
}

/** Le centre de la table : pioche, défausse, et la carte qu'on tient en main. */
export function TableCenter({
  drawPileCount,
  discardTop,
  heldCard,
  heldFrom,
  heldByMe,
  canDraw,
  canTakeDiscard,
  canDiscardHeld,
  onDraw,
  onTakeDiscard,
  onDiscardHeld,
}: TableCenterProps) {
  const holding = heldFrom !== null;

  return (
    <div className="flex items-end justify-center gap-5">
      {/* Pioche */}
      <div className="flex w-[4.5rem] flex-col items-center gap-1.5" data-testid="draw-pile">
        <div className={`relative w-full ${canDraw ? 'is-playable' : ''}`}>
          {/* Épaisseur du paquet : deux dos décalés sous le premier. */}
          <div className="pointer-events-none absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-lg bg-black/40" />
          <div className="pointer-events-none absolute inset-0 translate-x-[1.5px] translate-y-[1.5px] rounded-lg bg-black/30" />
          <PlayingCard
            value={null}
            faceUp={false}
            size="md"
            target={canDraw}
            dimmed={drawPileCount === 0}
            onClick={canDraw ? onDraw : undefined}
          />
        </div>
        <PileLabel>pioche</PileLabel>
        <span className="tnum text-[0.65rem] text-ink-faint">{drawPileCount}</span>
      </div>

      {/* Carte en main */}
      <div className="flex w-[5.25rem] flex-col items-center gap-1.5 pb-6">
        <AnimatePresence mode="popLayout">
          {holding ? (
            <motion.div
              key="held"
              className="w-full"
              initial={{ y: 14, opacity: 0, scale: 0.85 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              <div style={{ filter: 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.55))' }}>
                <PlayingCard
                  layoutId="held-card"
                  value={heldByMe ? heldCard : null}
                  faceUp={heldByMe}
                  size="lg"
                />
              </div>
              {canDiscardHeld && (
                <button
                  type="button"
                  onClick={onDiscardHeld}
                  className="mt-2 w-full rounded-full border border-white/15 bg-white/10 px-2 py-1.5 text-[0.68rem] font-semibold text-ink active:scale-95"
                >
                  Défausser
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="grid h-[5rem] w-full place-items-center rounded-xl border border-dashed border-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-[0.6rem] uppercase tracking-widest text-ink-faint">en main</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Défausse */}
      <div className="flex w-[4.5rem] flex-col items-center gap-1.5" data-testid="discard-pile">
        <div className={`relative w-full ${canTakeDiscard ? 'is-playable' : ''}`}>
          {discardTop === null ? (
            <div className="aspect-[3/4] w-full rounded-lg border border-dashed border-white/12" />
          ) : (
            <PlayingCard
              layoutId="discard-top"
              value={discardTop}
              faceUp
              size="md"
              target={canTakeDiscard}
              onClick={canTakeDiscard ? onTakeDiscard : undefined}
            />
          )}
        </div>
        <PileLabel>défausse</PileLabel>
        <span className="tnum text-[0.65rem] text-ink-faint">&nbsp;</span>
      </div>
    </div>
  );
}
