'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { PlayingCard } from '@/components/PlayingCard';
import { cue } from '@/lib/client/feedback';
import { MOVE, SNAP } from '@/lib/client/motion';
import {
  DECK_SIZE,
  JOKER_CARD,
  JOKER_COUNT,
  SPICY_COMPOSITION,
  STEAL_CARD,
  SWAP_CARD,
  SWAP_COUNT,
  stealCount,
  type PileCard,
  type Variant,
} from '@/lib/skyjo';

/**
 * Ce que le mode spicy ajoute au paquet, carte par carte.
 *
 * Une phrase d'inventaire — « deux -5, deux jokers, cinq Vol et quatre Valse »
 * — disait ce que le paquet contient sans dire ce qu'on allait *jouer* :
 * personne ne choisit un mode sur une liste de courses. On montre donc les
 * cartes elles-mêmes, dans leurs couleurs, avec ce qu'elles font. C'est aussi
 * la première fois qu'un joueur les voit, et c'est là qu'il apprend à les
 * reconnaître : à la pioche, le magenta et le turquoise arrivent sans légende.
 *
 * Les nombres viennent des constantes du moteur : leur dosage est un réglage
 * d'équilibre (cf. `stealCount`), et un salon qui annoncerait cinq Vol là où
 * le paquet en glisse sept serait pire que pas d'annonce du tout. D'où la
 * table en argument : le nombre de Vol suit le nombre de joueurs, et il se
 * met à jour sous les yeux du salon à mesure que les invités arrivent.
 */
interface Extra {
  card: PileCard;
  count: number;
  name: string;
  /** La couleur du nom reprend celle de la carte : l'œil relie les deux sans lire. */
  ink: string;
  /** Où elle vit — c'est la moitié de ce qu'il faut comprendre du mode. */
  where: string;
  what: string;
}

function extrasFor(players: number): Extra[] {
  return [
    {
      card: SPICY_COMPOSITION[0][0],
      count: SPICY_COMPOSITION[0][1],
      name: '-5',
      // Le bleu clair du 0 plutôt que le marine de la carte : sur ce fond, un
      // marine ne se lit pas.
      ink: 'text-card-sky',
      where: 'dans les grilles',
      what: 'La plus basse du jeu : dix-sept points sous un 12. Sinon, une carte comme les autres.',
    },
    {
      card: JOKER_CARD,
      count: JOKER_COUNT,
      name: 'Joker',
      ink: 'text-joker',
      where: 'dans les grilles',
      what: 'Vaut 0 et complète n’importe quel groupe : 7 / joker / 7 saute comme trois 7.',
    },
    {
      card: STEAL_CARD,
      count: stealCount(players),
      name: 'Vol',
      ink: 'text-steal',
      where: 'à la pioche',
      what: 'Tu échanges une de tes cartes contre celle d’un adversaire — visible ou cachée.',
    },
    {
      card: SWAP_CARD,
      count: SWAP_COUNT,
      name: 'Valse',
      ink: 'text-swap',
      where: 'à la pioche',
      what: 'Deux de tes cartes échangent leur place : de quoi enfin aligner ta colonne.',
    },
  ];
}

/**
 * Le choix du mode, dans le salon.
 *
 * C'est le premier réglage de partie de l'application, et il ne vit que là :
 * le mode décide de la composition du paquet, donc il se fige à la
 * distribution. Les invités le lisent sans pouvoir le changer — mais ils le
 * lisent, parce qu'arriver dans une partie et découvrir un joker en cours de
 * manche n'est pas une surprise agréable.
 */
export function VariantPicker({
  variant,
  players,
  canChange,
  onChange,
}: {
  variant: Variant;
  /** Les joueurs déjà assis : le nombre de Vol en dépend. */
  players: number;
  /** Seul l'hôte choisit : les autres lisent le mode sans pouvoir en changer. */
  canChange: boolean;
  onChange: (variant: Variant) => void;
}) {
  const spicy = variant === 'spicy';
  const extras = extrasFor(players);
  /** Ce que le mode ajoute au paquet officiel, tout compris. */
  const extraTotal = extras.reduce((n, extra) => n + extra.count, 0);

  return (
    <div className="w-full max-w-xs">
      <p className="mb-1.5 text-center text-[0.6rem] uppercase tracking-[0.2em] text-ink-faint">
        mode
      </p>

      {canChange ? (
        <div className="flex gap-1 rounded-2xl border border-white/12 bg-white/5 p-1">
          {(['classic', 'spicy'] as const).map((option) => {
            const on = option === variant;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  if (!on) cue('tap');
                  onChange(option);
                }}
                aria-pressed={on}
                className={[
                  'flex-1 rounded-xl px-3 py-2 text-sm font-bold transition active:scale-[0.98]',
                  on
                    ? option === 'spicy'
                      ? 'bg-steal/25 text-steal ring-1 ring-steal/60'
                      : 'bg-white/12 text-ink ring-1 ring-white/25'
                    : 'text-ink-dim',
                ].join(' ')}
              >
                {option === 'spicy' ? 'Spicy' : 'Classique'}
              </button>
            );
          })}
        </div>
      ) : (
        <p
          className={`rounded-2xl border px-4 py-2.5 text-center text-sm font-bold ${
            spicy ? 'border-steal/50 bg-steal/12 text-steal' : 'border-white/12 bg-white/5 text-ink'
          }`}
        >
          {spicy ? 'Spicy' : 'Classique'}
        </p>
      )}

      {/* La hauteur s'anime au lieu de sauter : l'interrupteur est juste
          au-dessus, et un panneau qui se déplie d'un coup pousserait le bouton
          « Lancer la partie » sous le doigt qui vient de basculer le mode. */}
      <AnimatePresence initial={false} mode="wait">
        {spicy ? (
          <motion.div
            key="spicy"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={MOVE}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl border border-steal/30 bg-steal/[0.07] p-2.5">
              <p className="mb-2 text-center text-[0.62rem] uppercase tracking-[0.16em] text-steal">
                +{extraTotal} cartes dans le paquet
              </p>

              <ul className="space-y-1.5">
                {extras.map((extra, i) => (
                  <motion.li
                    key={extra.name}
                    // En cascade, de haut en bas : quatre lignes qui arrivent
                    // toutes ensemble se lisent comme un bloc de texte, et on
                    // ne regarde plus les cartes.
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SNAP, delay: 0.05 + 0.05 * i }}
                    className="flex items-start gap-2.5 rounded-xl bg-white/[0.04] p-1.5"
                  >
                    <div className="w-9 shrink-0">
                      <PlayingCard value={extra.card} faceUp size="sm" still />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className={`text-[0.72rem] font-bold leading-none ${extra.ink}`}>
                        <span className="tnum">×{extra.count}</span> {extra.name}{' '}
                        <span className="font-semibold text-ink-faint">· {extra.where}</span>
                      </p>
                      <p className="mt-1 text-[0.68rem] leading-snug text-ink-dim">{extra.what}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>

              {/* Ce que le mode ne change *pas* est la moitié de la réponse :
                  sans cette ligne, « spicy » se lit comme un autre jeu. */}
              <p className="mt-2 text-center text-[0.64rem] leading-snug text-ink-faint">
                Le reste ne bouge pas : tour de jeu, colonnes, lignes, comptage.
                <Link href="/regles" className="block underline underline-offset-2">
                  Le détail des quatre cartes
                </Link>
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="classic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MOVE}
            className="mt-1.5 text-center text-[0.68rem] leading-snug text-ink-dim"
          >
            Le paquet officiel, rien de plus : {DECK_SIZE} cartes, de -2 à 12.
            <span className="block text-ink-faint">Spicy en ajoute {extraTotal}.</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
