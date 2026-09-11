'use client';

import { motion } from 'motion/react';
import { memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FLIP, SNAP } from '@/lib/client/motion';
import { JOKER_CARD, STEAL_CARD, type PileCard } from '@/lib/skyjo';

/**
 * Une carte Skyjo.
 *
 * Le code couleur est celui du jeu physique — bleu foncé pour les négatives,
 * cyan pour le zéro, puis vert / jaune / rouge à mesure que ça fait mal. C'est
 * ce qui permet de lire une grille adverse d'un coup d'œil, sans lire un chiffre.
 *
 * Les deux cartes du mode spicy sortent volontairement de cette échelle : elles
 * ne valent pas « un peu plus » ou « un peu moins », elles font autre chose. Le
 * joker est la seule carte presque blanche du jeu et le Vol la seule magenta —
 * à la taille d'une vignette adverse, c'est la couleur qui les fait reconnaître
 * avant le symbole.
 */

export type Tone = 'navy' | 'sky' | 'green' | 'yellow' | 'red' | 'joker' | 'steal' | 'blank';

export function toneOf(card: PileCard): Tone {
  if (card === JOKER_CARD) return 'joker';
  if (card === STEAL_CARD) return 'steal';
  if (card < 0) return 'navy';
  if (card === 0) return 'sky';
  if (card <= 4) return 'green';
  if (card <= 8) return 'yellow';
  return 'red';
}

const TONES: Record<Tone, { from: string; to: string; ink: string; edge: string }> = {
  navy: { from: '#2f5bd0', to: '#132b73', ink: '#ffffff', edge: '#5d86e8' },
  sky: { from: '#6fd6ff', to: '#1e9fd8', ink: '#052a3d', edge: '#a5e8ff' },
  green: { from: '#6ed673', to: '#2f9138', ink: '#06280a', edge: '#a2eda6' },
  yellow: { from: '#ffdc5e', to: '#e0a908', ink: '#3d2b00', edge: '#ffeda1' },
  red: { from: '#ff7070', to: '#c22626', ink: '#ffffff', edge: '#ffa8a8' },
  // Le joker vaut 0 et complète n'importe quel groupe : ni une bonne ni une
  // mauvaise carte, donc aucune place sur l'échelle bleu → rouge.
  joker: { from: '#fdfbff', to: '#c9bcec', ink: '#2a1a55', edge: '#ffffff' },
  // Le Vol ne se pose jamais dans une grille : on ne le voit qu'en main, le
  // temps d'un tour.
  steal: { from: '#ff8adf', to: '#af1f8c', ink: '#ffffff', edge: '#ffc2ee' },
  // Retournée, mais pas encore lue : la carte a bougé au doigt, sa valeur
  // arrive du serveur. Une face neutre le dit sans rien inventer.
  blank: { from: '#57497e', to: '#332a55', ink: '#ffffff', edge: '#7b6bab' },
};

/**
 * Le style de chaque face, calculé une fois pour toutes.
 *
 * Il n'y en a que six, et ils ne dépendent de rien d'autre que la valeur : les
 * recomposer à chaque rendu, c'est concaténer trois dégradés et deux ombres par
 * carte — une trentaine de fois par image sur une table qui bouge.
 */
const FACE_STYLE: Record<Tone, CSSProperties> = Object.fromEntries(
  (Object.keys(TONES) as Tone[]).map((tone) => {
    const { from, to, ink, edge } = TONES[tone];
    return [
      tone,
      {
        background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)`,
        boxShadow: `inset 0 1px 0 ${edge}, inset 0 -2px 6px rgb(0 0 0 / 0.28), 0 2px 6px rgb(0 0 0 / 0.4)`,
        color: ink,
        // La face neutre prend sa couleur quand la valeur arrive : le raccord
        // se fait en fondu plutôt qu'en sautant d'un ton à l'autre.
        transition: 'background 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
      },
    ];
  }),
) as Record<Tone, CSSProperties>;

/** Le dos de carte : identique pour toutes, donc figé au chargement du module. */
const BACK_STYLE: CSSProperties = {
  background:
    'repeating-linear-gradient(135deg, #2a1a55 0 4px, #221546 4px 8px), radial-gradient(circle at 50% 40%, #3b2470, #1a1035)',
  boxShadow:
    'inset 0 1px 0 rgb(255 255 255 / 0.14), inset 0 -2px 6px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.4)',
};

/** Les deux seules échelles qu'une carte prenne : autant ne pas les réallouer. */
const SCALE_IDLE = { scale: 1 };
const SCALE_SELECTED = { scale: 1.04 };
const TAP_SCALE = { scale: 0.96 };

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

/** Ce qu'une carte annonce aux lecteurs d'écran. */
function describeCard(card: PileCard): string {
  if (card === JOKER_CARD) return 'Joker, vaut 0 et complète n’importe quel groupe';
  if (card === STEAL_CARD) return 'Carte Vol';
  return `Carte ${card}`;
}

export interface PlayingCardProps {
  /** `null` quand la carte est face cachée : le client n'en connaît pas la valeur. */
  value: PileCard | null;
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

function Card({
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
  // Retournée sans valeur : le serveur n'a pas encore répondu.
  const awaiting = faceUp && value === null;
  const face = FACE_STYLE[value === null ? (faceUp ? 'blank' : 'navy') : toneOf(value)];
  const interactive = !!onClick;
  const ring = INTENT_CLASS[intent];
  const label = ariaLabel ?? (faceUp && value !== null ? describeCard(value) : 'Carte face cachée');
  const flip = useMemo(() => ({ rotateY: faceUp ? 0 : 180 }), [faceUp]);

  const inner = (
    <>
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={flip}
        // Un retournement se regarde : c'est le moment où une carte cachée
        // devient une information. Trop court, il se lit comme un changement
        // d'image plutôt que comme un geste.
        transition={FLIP}
      >
        {/* Recto : la valeur */}
        <div
          className={[
            'card-face absolute inset-0 flex items-center justify-center overflow-hidden [backface-visibility:hidden]',
            RADIUS[size],
            awaiting ? 'card-awaiting' : '',
            ring,
          ].join(' ')}
          style={face}
        >
          {value === JOKER_CARD ? (
            // L'étoile dit « celle-là n'est pas comme les autres », le 0 dit ce
            // qu'elle coûte. Sans le chiffre, la grille ne s'additionne plus de
            // tête — et compter sa manche est la moitié du jeu.
            <>
              <span className="card-numeral font-black leading-none">★</span>
              <span className="tnum card-corner absolute font-black leading-none">0</span>
            </>
          ) : value === STEAL_CARD ? (
            <span className="card-numeral font-black leading-none">⇄</span>
          ) : (
            <span className="tnum card-numeral font-black leading-none tracking-tight">{value}</span>
          )}
        </div>

        {/* Verso : le dos de carte */}
        <div
          className={[
            'card-face absolute inset-0 flex items-center justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]',
            RADIUS[size],
            ring,
          ].join(' ')}
          style={BACK_STYLE}
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
    animate: selected ? SCALE_SELECTED : SCALE_IDLE,
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
      whileTap={interactive ? TAP_SCALE : undefined}
    >
      {inner}
    </motion.div>
  );
}

/**
 * Mémoïsée, parce qu'elle est le composant le plus instancié de l'écran.
 *
 * Une table en cours en aligne près de trente, chacune portant un conteneur 3D,
 * deux faces et une animation. Un coup n'en change qu'une ou deux : sans ce
 * filtre, la moindre secousse d'état — une annonce qui s'efface, un sondage qui
 * revient — les redessinait toutes, et ça se voyait pile pendant les
 * retournements.
 */
export const PlayingCard = memo(Card);

/**
 * Emplacement vide : une colonne éliminée laisse un trou, pas une carte.
 *
 * Le trou doit se voir. C'est le seul endroit de la grille qui raconte le passé
 * de la manche — trois cartes identiques sont parties d'ici — et c'est aussi ce
 * qui explique une grille adverse à quatre cartes retournées sur huit. Tout le
 * dessin est dans `.empty-slot` : des hachures, un tireté franc et un creux.
 */
export function EmptySlot({ size = 'md' }: { size?: CardSize }) {
  return (
    <div
      className={`empty-slot ${size === 'xs' ? 'empty-slot-xs' : ''} aspect-[3/4] w-full ${RADIUS[size]}`}
      role="img"
      aria-label="Emplacement vidé"
    />
  );
}
