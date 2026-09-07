'use client';

import { AnimatePresence, motion } from 'motion/react';
import { PlayingCard } from './PlayingCard';

/**
 * Le bas de l'écran : la consigne, les deux piles, et la carte en main.
 *
 * Deux principes, tous deux issus de parties réelles sur téléphone.
 *
 * D'abord la place : c'est la moitié basse qu'un pouce atteint, donc c'est là
 * que vivent les boutons — la grille, qu'on lit autant qu'on la touche, garde
 * le haut et toute la surface restante.
 *
 * Ensuite la stabilité : chaque emplacement a une hauteur fixe, occupée ou non.
 * Prendre une carte ne doit pas pousser la grille sous le doigt qui vise déjà
 * la case suivante.
 */

export interface ActionDockProps {
  title: string;
  hint: string;
  emphasis: boolean;
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
    <span className="whitespace-nowrap text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </span>
  );
}

export function ActionDock({
  title,
  hint,
  emphasis,
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
}: ActionDockProps) {
  const holding = heldFrom !== null;

  return (
    <div className="safe-bottom shrink-0 border-t border-white/8 bg-felt-900/60 px-4 pt-2 backdrop-blur-sm">
      {/* Consigne : deux lignes réservées, pour que rien ne saute d'un tour à l'autre. */}
      <div className="mb-1.5 flex h-[2.5rem] flex-col justify-center text-center">
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-[0.95rem] font-bold leading-tight ${emphasis ? 'text-accent' : 'text-ink-dim'}`}
        >
          {title}
        </motion.div>
        <div className="text-[0.68rem] leading-tight text-ink-faint">{hint}</div>
      </div>

      <div className="flex items-end justify-center gap-5 pb-1">
        {/* Pioche */}
        <div className="flex w-[4.1rem] flex-col items-center gap-1" data-testid="draw-pile">
          {/* Une pile hors d'atteinte s'efface un peu : la défausse reste lisible,
              mais on ne la confond pas avec un bouton. */}
          <div className={`relative w-full ${canDraw ? 'is-playable' : 'opacity-70'}`}>
            {/* Épaisseur du paquet : deux dos décalés sous le premier. */}
            <div className="pointer-events-none absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-lg bg-black/40" />
            <div className="pointer-events-none absolute inset-0 translate-x-[1.5px] translate-y-[1.5px] rounded-lg bg-black/30" />
            <PlayingCard
              value={null}
              faceUp={false}
              size="md"
              intent={canDraw ? 'target' : 'none'}
              dimmed={drawPileCount === 0}
              onClick={canDraw ? onDraw : undefined}
              aria-label={`Piocher — ${drawPileCount} cartes`}
            />
            {/* Le compte tient dans un coin : en légende il passait à la ligne
                et remontait la pile au-dessus de la défausse. */}
            <span className="tnum pointer-events-none absolute -right-1.5 -top-1.5 rounded-full bg-felt-700 px-1.5 py-px text-[0.58rem] font-bold text-ink-dim ring-1 ring-white/15">
              {drawPileCount}
            </span>
          </div>
          <PileLabel>pioche</PileLabel>
        </div>

        {/* Carte en main : emplacement toujours présent, rempli ou non. */}
        <div className="flex w-[5.2rem] flex-col items-center gap-1">
          <div className="relative aspect-[3/4] w-full">
            <AnimatePresence>
              {holding ? (
                <motion.div
                  key="held"
                  className="absolute inset-0"
                  initial={{ y: 12, opacity: 0, scale: 0.85 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -8, opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                  style={{ filter: 'drop-shadow(0 8px 20px rgb(0 0 0 / 0.6))' }}
                >
                  <PlayingCard
                    layoutId="held-card"
                    value={heldByMe ? heldCard : null}
                    faceUp={heldByMe}
                    size="lg"
                    aria-label={heldByMe && heldCard !== null ? `En main : ${heldCard}` : 'Carte en main'}
                  />
                </motion.div>
              ) : (
                <div className="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-white/10">
                  <span className="text-[0.55rem] uppercase tracking-widest text-ink-faint">
                    en main
                  </span>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Même hauteur que les libellés des piles : le bouton ne décale rien. */}
          <div className="flex h-[1.05rem] items-center">
            {canDiscardHeld ? (
              <button
                type="button"
                onClick={onDiscardHeld}
                className="rounded-full border border-white/20 bg-white/12 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-ink active:scale-95"
              >
                Jeter
              </button>
            ) : (
              <PileLabel>{holding ? 'à placer' : ' '}</PileLabel>
            )}
          </div>
        </div>

        {/* Défausse */}
        <div className="flex w-[4.1rem] flex-col items-center gap-1" data-testid="discard-pile">
          <div className={`relative w-full ${canTakeDiscard ? 'is-playable' : 'opacity-70'}`}>
            {discardTop === null ? (
              <div className="aspect-[3/4] w-full rounded-lg border border-dashed border-white/12" />
            ) : (
              <PlayingCard
                layoutId="discard-top"
                value={discardTop}
                faceUp
                size="md"
                intent={canTakeDiscard ? 'target' : 'none'}
                onClick={canTakeDiscard ? onTakeDiscard : undefined}
                aria-label={`Prendre la défausse — ${discardTop}`}
              />
            )}
          </div>
          <PileLabel>défausse</PileLabel>
        </div>
      </div>
    </div>
  );
}
