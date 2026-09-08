'use client';

import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { EmptySlot, PlayingCard, type CardSize } from './PlayingCard';
import { cellAnchor } from '@/lib/client/flights';

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
  /** Les cases réellement vidées — pas la géométrie du groupe. */
  indices: number[];
  value: number;
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
 * Le groupe qui saute.
 *
 * Les cartes sont déjà parties de l'état du jeu : sans ce fantôme, trois cases
 * se videraient d'un coup et personne ne saurait *lesquelles* étaient
 * identiques, ni pourquoi. Elles restent donc en place, cerclées, le temps
 * qu'on les lise — puis elles disparaissent d'un coup, à l'instant précis où
 * la couche de vol les fait décoller vers la défausse (`clearDelay`). La carte
 * ne s'efface pas : elle change de main.
 */
function ClearGhost({ value, size, delay }: { value: number; size: CardSize; delay: number }) {
  const total = delay + 0.1;
  const gone = delay / total;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10"
      initial={{ opacity: 1, scale: 1 }}
      animate={{ opacity: [1, 1, 1, 0], scale: [1, 1.06, 1.06, 1] }}
      transition={{
        duration: total,
        times: [0, Math.min(0.3, gone / 2), gone, 1],
        ease: 'easeOut',
      }}
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
  echoKey,
  turning,
  anchor,
  onCell,
}: {
  index: number;
  /** `null` quand la carte est face cachée : sa valeur est un secret du serveur. */
  value: number | null;
  faceUp: boolean;
  size: CardSize;
  radius: string;
  /** Le joueur peut agir sur cette case maintenant. */
  playable: boolean;
  /** …et il faut le lui montrer. Faux quand *toutes* les cases le sont. */
  marked: boolean;
  touched: boolean;
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
      overlay={touched ? <TouchedRing key={echoKey} radius={radius} /> : undefined}
      onClick={playable && onCell ? press : undefined}
      aria-label={faceUp ? `Carte ${value}` : 'Carte face cachée'}
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
                <ClearGhost
                  key={echoKey}
                  value={cleared!.value}
                  size={size}
                  delay={cleared!.delay}
                />
              )}
            </div>
          );
        }

        return (
          <GridCell
            key={index}
            index={index}
            value={cell.faceUp ? cell.value : null}
            faceUp={cell.faceUp}
            size={size}
            radius={radius}
            playable={isTarget?.(index) ?? false}
            marked={markTargets}
            touched={touched === index}
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
