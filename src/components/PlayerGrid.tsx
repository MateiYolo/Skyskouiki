'use client';

import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { EmptySlot, PlayingCard, type CardSize } from './PlayingCard';
import { cellAnchor } from '@/lib/client/flights';
import { CLEAR_STAGGER } from '@/lib/client/motion';

import { JOKER_CARD, cellToCard, type ValueCard, type ViewCell } from '@/lib/skyjo';

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
  /** Les cases réellement vidées — pas la géométrie du groupe. */
  indices: number[];
  value: number;
  /** Celles de ces cases qui portaient le joker : il ne doit pas partir déguisé. */
  jokers: number[];
  /** Combien de temps (en secondes) les cartes restent visibles avant de partir. */
  delay: number;
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
  /** Case (ou cases, pour une Valse) jouée au dernier coup. */
  touched?: number | readonly number[] | null;
  /**
   * Case retenue par le joueur, en attente du second geste.
   *
   * Deux coups en ont besoin : le Vol et la Valse se jouent en deux taps — une
   * carte, puis l'autre — et sans marque il n'y a aucun moyen de savoir ce
   * qu'on a déjà désigné entre les deux.
   */
  selected?: number | null;
  /** La couleur de cette marque : celle de la carte qui a lancé l'échange. */
  selectedTone?: SelectedTone;
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

/** Les deux couleurs d'échange, et leur halo. */
const SELECTED_TONE = {
  steal: { color: 'var(--color-steal)', glow: 'rgb(233 78 192 / 0.55)' },
  swap: { color: 'var(--color-swap)', glow: 'rgb(47 224 194 / 0.5)' },
} as const;

export type SelectedTone = keyof typeof SELECTED_TONE;

/**
 * La carte que je viens de désigner, et qui attend le second geste.
 *
 * Le léger agrandissement que porte déjà `PlayingCard` ne suffit pas ici : les
 * autres cartes visibles restent des cibles légitimes — on peut changer d'avis
 * — donc elles gardent toutes leur liseré, et la seule différence était quatre
 * pour cent de taille. Le liseré prend donc la couleur de la carte qui a
 * déclenché l'échange : magenta dans la main, magenta sur ma carte, magenta
 * sur la grille d'en face pour un Vol ; turquoise de bout en bout pour une
 * Valse. Une seule couleur par échange, du début à la fin.
 */
function SelectedRing({ radius, tone }: { radius: string; tone: SelectedTone }) {
  const { color, glow } = SELECTED_TONE[tone];
  return (
    <span
      className={`pointer-events-none absolute -inset-[3px] ${radius}`}
      style={{ boxShadow: `0 0 0 2.5px ${color}, 0 0 18px ${glow}` }}
      aria-hidden
    />
  );
}

/**
 * Le groupe qui saute.
 *
 * Les cartes sont déjà parties de l'état du jeu : sans ce fantôme, trois cases
 * se videraient d'un coup et personne ne saurait *lesquelles* étaient
 * identiques, ni pourquoi. Elles restent donc en place, cerclées, le temps
 * qu'on les lise — puis elles disparaissent d'un coup, à l'instant précis où
 * la couche de vol les fait décoller vers la défausse (`clearDelay`). La carte
 * ne s'efface pas : elle change de main.
 */
function ClearGhost({
  value,
  size,
  delay,
  rank,
}: {
  value: ValueCard;
  size: CardSize;
  delay: number;
  /** Rang de la carte dans le groupe : le coup d'œil part d'un bout à l'autre. */
  rank: number;
}) {
  const total = delay + 0.1;
  const gone = delay / total;
  // Le sursaut parcourt le groupe au lieu de le secouer d'un bloc : c'est ce
  // qui fait lire « ces trois-là, ensemble » plutôt que « ces trois-là ».
  const wave = Math.min(0.34, (0.12 + rank * CLEAR_STAGGER) / total);
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10"
      initial={{ opacity: 1, scale: 1 }}
      animate={{ opacity: [1, 1, 1, 0], scale: [1, 1.08, 1.04, 1] }}
      transition={{ duration: total, times: [0, wave, gone, 1], ease: 'easeOut' }}
    >
      <PlayingCard value={value} faceUp size={size} intent="target" />
    </motion.div>
  );
}

/**
 * Une case, et rien qu'elle.
 *
 * Séparer chaque case en composant mémoïsé n'est pas de la coquetterie : un
 * coup ne touche qu'une carte sur douze, et sans ce découpage les onze autres
 * refaisaient le trajet complet — conteneur 3D, deux faces, animation — à
 * chaque rendu de la grille.
 *
 * D'où des propriétés toutes scalaires, la valeur de la carte comprise : la
 * vue arrive du réseau, donc chaque case est un objet neuf à chaque réponse du
 * serveur, et le comparer par référence ne filtrerait jamais rien. Le seul
 * objet qui reste — le liseré du dernier coup — est construit ici, pour ne pas
 * changer d'identité tant que la case n'a pas bougé.
 */
const GridCell = memo(function GridCell({
  index,
  value,
  faceUp,
  size,
  radius,
  playable,
  marked,
  touched,
  selected,
  selectedTone,
  echoKey,
  turning,
  anchor,
  onCell,
}: {
  index: number;
  /** `null` quand la carte est face cachée : sa valeur est un secret du serveur. */
  value: ValueCard | null;
  faceUp: boolean;
  size: CardSize;
  radius: string;
  /** Le joueur peut agir sur cette case maintenant. */
  playable: boolean;
  /** …et il faut le lui montrer. Faux quand *toutes* les cases le sont. */
  marked: boolean;
  touched: boolean;
  selected: boolean;
  selectedTone: SelectedTone;
  echoKey: number;
  turning: boolean;
  anchor: string | undefined;
  onCell?: (index: number) => void;
}) {
  const press = useCallback(() => onCell?.(index), [onCell, index]);

  return (
    <PlayingCard
      data-anchor={anchor}
      value={faceUp ? value : null}
      faceUp={faceUp || turning}
      size={size}
      intent={playable && marked ? 'target' : 'none'}
      selected={selected}
      overlay={
        selected ? (
          <SelectedRing radius={radius} tone={selectedTone} />
        ) : touched ? (
          <TouchedRing key={echoKey} radius={radius} />
        ) : undefined
      }
      onClick={playable && onCell ? press : undefined}
    />
  );
});

/** La grille 4 × 3 d'un joueur. Une case vide est une colonne déjà éliminée. */
export const PlayerGrid = memo(function PlayerGrid({
  grid,
  size = 'md',
  isTarget,
  markTargets = true,
  onCell,
  touched = null,
  selected = null,
  selectedTone = 'steal',
  cleared = null,
  echoKey = 0,
  revealing,
  playerId,
}: PlayerGridProps) {
  const gap = size === 'xs' ? 'gap-[2px]' : size === 'sm' ? 'gap-1' : 'gap-1.5';
  const radius = size === 'xs' ? 'rounded-[4px]' : size === 'sm' ? 'rounded-lg' : 'rounded-xl';
  const clearing = cleared ? new Set(cleared.indices) : null;
  // Une case, deux cases ou aucune : la grille ne fait que les cercler.
  const touchedCells = touched === null ? null : typeof touched === 'number' ? [touched] : touched;

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
                <ClearGhost
                  key={echoKey}
                  // Le joker repart en joker : c'est lui qui a fermé le groupe,
                  // le montrer sous la valeur des autres rendrait l'élimination
                  // incompréhensible.
                  value={cleared!.jokers.includes(index) ? JOKER_CARD : cleared!.value}
                  size={size}
                  delay={cleared!.delay}
                  rank={cleared!.indices.indexOf(index)}
                />
              )}
            </div>
          );
        }

        return (
          <GridCell
            key={index}
            index={index}
            value={cell.faceUp ? cellToCard(cell) : null}
            faceUp={cell.faceUp}
            size={size}
            radius={radius}
            playable={isTarget?.(index) ?? false}
            marked={markTargets}
            touched={touchedCells?.includes(index) ?? false}
            selected={selected === index}
            selectedTone={selectedTone}
            echoKey={echoKey}
            turning={revealing?.includes(index) ?? false}
            anchor={playerId ? cellAnchor(playerId, index) : undefined}
            onCell={onCell}
          />
        );
      })}
    </div>
  );
})
