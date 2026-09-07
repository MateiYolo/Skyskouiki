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
  /** Déjà filtrée par le serveur : `null` quand le porteur seul a le droit de la voir. */
  heldCard: number | null;
  heldFrom: 'draw' | 'discard' | null;
  /** Ce que fait l'adversaire quand c'est lui qui tient la carte. */
  heldNote: string | null;
  canDraw: boolean;
  canTakeDiscard: boolean;
  canDiscardHeld: boolean;
  onDraw: () => void;
  onTakeDiscard: () => void;
  onDiscardHeld: () => void;
}

function PileLabel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap text-[0.6rem] font-semibold uppercase tracking-[0.14em] ${
        accent ? 'text-accent' : 'text-ink-faint'
      }`}
    >
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
  heldNote,
  canDraw,
  canTakeDiscard,
  canDiscardHeld,
  onDraw,
  onTakeDiscard,
  onDiscardHeld,
}: ActionDockProps) {
  const holding = heldFrom !== null;
  /**
   * Jeter, c'est poser la carte sur la défausse — alors on rend la défausse
   * elle-même touchable. C'est le geste de la vraie table, et la cible fait la
   * taille d'une carte au lieu d'une pastille de dix pixels. Le petit bouton
   * « Jeter » reste à côté pour qui cherche un mot plutôt qu'un endroit.
   */
  const throwHere = canDiscardHeld;
  // Le serveur ne descend la valeur que si le joueur a le droit de la connaître :
  // la sienne toujours, celle d'un adversaire seulement s'il l'a prise dans la
  // défausse — auquel cas tout le monde l'a vue passer.
  const heldVisible = heldCard !== null;

  return (
    <div className="safe-bottom shrink-0 border-t border-white/8 bg-felt-900/60 px-4 pt-2 backdrop-blur-sm">
      {/* Consigne : deux lignes réservées, pour que rien ne saute d'un tour à l'autre. */}
      <div className="mb-1 flex h-[2.35rem] flex-col justify-center text-center">
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-[0.95rem] font-bold leading-tight ${emphasis ? 'text-accent' : 'text-ink-dim'}`}
        >
          {title}
        </motion.div>
        <div className="text-[0.68rem] leading-tight text-ink-faint">{heldNote ?? hint}</div>
      </div>

      <div className="flex items-end justify-center gap-5 pb-1">
        {/* Pioche */}
        <div className="flex w-[3.8rem] flex-col items-center gap-1" data-testid="draw-pile">
          {/* Une pile hors d'atteinte s'efface un peu : la défausse reste lisible,
              mais on ne la confond pas avec un bouton. */}
          <div
            className={`relative w-full ${canDraw ? 'is-playable' : holding ? 'opacity-35' : 'opacity-70'}`}
          >
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
        <div className="flex w-[4.8rem] flex-col items-center gap-1">
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
                    value={heldCard}
                    faceUp={heldVisible}
                    size="lg"
                    aria-label={heldVisible ? `Carte en main : ${heldCard}` : 'Carte en main, face cachée'}
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

          {/* Hauteur réservée en toutes circonstances : le bouton apparaît sans
              pousser les piles sous le doigt qui vise déjà. */}
          <div className="flex h-[1.7rem] items-center">
            {canDiscardHeld ? (
              <button
                type="button"
                onClick={onDiscardHeld}
                className="rounded-full border border-white/25 bg-white/12 px-3.5 py-1 text-[0.66rem] font-bold uppercase tracking-wide text-ink active:scale-95"
              >
                Jeter
              </button>
            ) : (
              <PileLabel>{holding ? 'à placer' : ' '}</PileLabel>
            )}
          </div>
        </div>

        {/* Défausse */}
        <div className="flex w-[3.8rem] flex-col items-center gap-1" data-testid="discard-pile">
          <div
            className={`relative w-full ${
              canTakeDiscard || throwHere ? 'is-playable' : holding ? 'opacity-50' : 'opacity-70'
            }`}
          >
            {discardTop === null ? (
              throwHere ? (
                <button
                  type="button"
                  onClick={onDiscardHeld}
                  aria-label="Jeter la carte en main"
                  className="is-target grid aspect-[3/4] w-full place-items-center rounded-lg border-2 border-dashed border-accent/70 text-lg text-accent active:scale-95"
                >
                  ↓
                </button>
              ) : (
                <div className="aspect-[3/4] w-full rounded-lg border border-dashed border-white/12" />
              )
            ) : (
              <PlayingCard
                layoutId="discard-top"
                value={discardTop}
                faceUp
                size="md"
                intent={canTakeDiscard || throwHere ? 'target' : 'none'}
                onClick={canTakeDiscard ? onTakeDiscard : throwHere ? onDiscardHeld : undefined}
                aria-label={
                  throwHere
                    ? 'Jeter la carte en main sur la défausse'
                    : `Prendre la défausse — ${discardTop}`
                }
              />
            )}
          </div>
          <PileLabel accent={throwHere}>{throwHere ? 'jeter ici' : 'défausse'}</PileLabel>
        </div>
      </div>
    </div>
  );
}
