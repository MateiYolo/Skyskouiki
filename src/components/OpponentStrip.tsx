'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, ScoreMeter, ScoreTiles } from './PlayerPanel';
import { PlayerGrid } from './PlayerGrid';
import { MOVE, SETTLE } from '@/lib/client/motion';
import type { MoveEcho } from '@/lib/client/echo';
import { nextPlayerId } from '@/lib/skyjo';
import type { GameView, ViewPlayer } from '@/lib/skyjo';

/**
 * Les adversaires, en haut de l'écran.
 *
 * Leur grille est une information stratégique : savoir qui approche du seuil et
 * qui a encore huit cartes cachées décide de quand on ferme. Elle doit donc se
 * lire, pas se deviner.
 *
 * La hauteur ne se prend pourtant pas sur la grille du joueur : celle-ci est un
 * carré bridé par la largeur de l'écran (`board-cap`), et sur un téléphone haut
 * elle laisse cent bons pixels inutilisés. C'est ce reste qui finance les
 * grilles adverses. À partir de quatre joueurs, la bande défile.
 *
 * Et à partir de quatre joueurs, elle défile **toute seule** jusqu'à celui dont
 * c'est le tour : la consigne annonçait « Hélène joue » pendant que la grille
 * d'Hélène était à cinq cents pixels hors de l'écran, et les cartes qu'elle
 * jouait volaient vers un point qu'on ne voyait pas.
 */

interface Props {
  view: GameView;
  opponents: ViewPlayer[];
  /** Le dernier coup de chacun, par identifiant : à plusieurs, deux joueurs
      peuvent avoir joué depuis le dernier rendu. */
  moves: Readonly<Record<string, string>>;
  echo: MoveEcho | null;
  /**
   * Je tiens un Vol et j'ai désigné ma carte : il reste à choisir la victime.
   *
   * Les vignettes deviennent alors des cibles. On ne fait pas taper la carte
   * adverse directement dedans — à huit joueurs une case y mesure quelques
   * pixels — mais la vignette ouvre la grille en grand, où l'on vise.
   */
  picking?: boolean;
  onOpen: (playerId: string) => void;
}

/** Mémoïsée : la grille d'en face ne bouge que quand la partie bouge. */
export const OpponentStrip = memo(function OpponentStrip({
  view,
  opponents,
  moves,
  echo,
  picking = false,
  onOpen,
}: Props) {
  // À deux — le cas de loin le plus fréquent — l'unique adversaire s'étale en
  // largeur : ses infos passent à gauche et toute la hauteur du panneau revient
  // à sa grille. À plusieurs, chacun reprend une colonne et la bande défile.
  const solo = opponents.length === 1;
  const scroller = useRef<HTMLDivElement>(null);
  /** De quel côté il reste quelque chose à voir. Mesuré, pas deviné : trois
      adversaires débordent sur un téléphone étroit et pas sur un large. */
  const [more, setMore] = useState({ left: false, right: false });
  const current = view.currentPlayerId;
  const next = nextPlayerId(view);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const end = el.scrollWidth - el.clientWidth;
    setMore({ left: el.scrollLeft > 4, right: el.scrollLeft < end - 4 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, opponents.length]);

  /**
   * Amène le joueur actif sous les yeux.
   *
   * Seulement s'il n'y est pas déjà : sinon le moindre coup ramènerait la bande
   * à sa place et on ne pourrait plus regarder tranquillement la grille d'un
   * autre. Et seulement en jeu — pendant les retournements initiaux, « le
   * joueur courant » ne veut encore rien dire.
   */
  useEffect(() => {
    const el = scroller.current;
    if (!el || !current || view.phase !== 'playing') return;
    const seat = el.querySelector<HTMLElement>(`[data-player="${CSS.escape(current)}"]`);
    // Introuvable : c'est moi qui joue, et ma grille est toujours à l'écran.
    if (!seat) return;
    const strip = el.getBoundingClientRect();
    const box = seat.getBoundingClientRect();
    if (box.left >= strip.left - 1 && box.right <= strip.right + 1) return;
    seat.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [current, view.phase]);

  return (
    <div
      ref={scroller}
      className={[
        // Trois parts contre cinq : la grille d'en face se lit autant que la
        // mienne se joue, et sur un écran court elle ne doit pas fondre en
        // vignette — d'où le plancher, qui la garde déchiffrable.
        'no-scrollbar flex min-h-[7.5rem] max-h-[15rem] flex-[3] gap-2 overflow-x-auto px-3 pt-1',
        // `-safe` et pas `center` tout court : un conteneur centré qui déborde
        // déborde **des deux côtés**, et le débordement de gauche n'est pas
        // récupérable — `scrollLeft` est bloqué à zéro. À quatre joueurs sous
        // 375 px de large, le premier adversaire était rogné et inatteignable.
        'justify-center-safe',
        more.left && more.right ? 'fade-both' : more.right ? 'fade-right' : more.left ? 'fade-left' : '',
      ].join(' ')}
    >
      {opponents.map((player) => (
        <OpponentPanel
          key={player.id}
          player={player}
          solo={solo}
          active={player.id === current}
          next={player.id === next}
          closer={player.id === view.roundCloserId}
          target={view.targetScore}
          move={moves[player.id] ?? null}
          echo={echo}
          // Une grille entièrement éliminée n'a plus rien à se faire voler —
          // une carte face cachée, si.
          picking={picking && player.faceUpCount + player.faceDownCount > 0}
          onOpen={() => onOpen(player.id)}
        />
      ))}
    </div>
  );
})

/** Ce que la grille de ce joueur doit rejouer du dernier coup. */
function echoFor(playerId: string, echo: MoveEcho | null) {
  return {
    touched: echo?.touched[playerId] ?? null,
    cleared: echo?.cleared[playerId] ?? null,
    echoKey: echo?.version ?? 0,
  };
}

interface PanelProps {
  player: ViewPlayer;
  solo: boolean;
  active: boolean;
  /** C'est à lui juste après celui qui joue. */
  next: boolean;
  closer: boolean;
  target: number;
  move: string | null;
  echo: MoveEcho | null;
  picking: boolean;
  onOpen: () => void;
}

function OpponentPanel({
  player,
  solo,
  active,
  next,
  closer,
  target,
  move,
  echo,
  picking,
  onOpen,
}: PanelProps) {
  const identity = (
    <>
      <div className="flex items-center gap-1.5">
        <Avatar player={player} active={active} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.72rem] font-semibold leading-tight">{player.name}</div>
        </div>
        {solo && <ScoreTiles round={player.visibleSum} total={player.totalScore} target={target} size="sm" />}
        {closer && (
          <span className="shrink-0 rounded-full bg-danger/20 px-1.5 py-px text-[0.55rem] font-bold text-danger">
            fermé
          </span>
        )}
      </div>

      {/* Ce que l'autre vient de faire, en toutes lettres — c'est la moitié de
          ce qu'on vient chercher sur sa grille. Hauteur réservée pour que
          l'apparition de la phrase ne pousse pas les cartes.

          Le créneau sert deux fois : quand il n'y a rien à raconter sur ce
          joueur et que c'est à lui juste après, il le dit. C'est le seul
          endroit du panneau qui ait la largeur d'un mot — la ligne du nom, à
          cent vingt pixels, n'a déjà plus la place d'un badge de plus. */}
      <div className="flex h-[1.15rem] items-center">
        <AnimatePresence mode="wait">
          {move ? (
            <motion.span
              key={`${echo?.version ?? 0}-${move}`}
              className="truncate text-[0.72rem] font-semibold leading-tight text-accent"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={MOVE}
            >
              {move}
            </motion.span>
          ) : (
            !solo &&
            next && (
              <motion.span
                key="next"
                className="truncate text-[0.58rem] font-bold uppercase tracking-[0.14em] text-ink-faint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MOVE}
              >
                ensuite
              </motion.span>
            )
          )}
        </AnimatePresence>
      </div>
    </>
  );

  const frame = [
    'flex min-h-0 shrink-0 rounded-2xl border p-1.5 text-left transition-colors',
    picking
      ? 'border-steal/70 bg-steal/12'
      : active
        ? 'border-accent/60 bg-accent/10'
        : // Le suivant se distingue sans se disputer l'œil avec le joueur actif :
          // c'est la même couleur, quatre fois plus discrète.
          next && !solo
          ? 'border-accent/25 bg-white/[0.05]'
          : 'border-white/10 bg-white/[0.04]',
  ].join(' ');

  const label = picking
    ? `Voler une carte à ${player.name}`
    : `Voir la grille de ${player.name} en grand — ${player.visibleSum} sur la manche, ${player.totalScore} points au total`;

  if (solo) {
    // Face à face : exactement la disposition de ma propre grille, en miroir de
    // l'autre côté du terrain — nom et scores en ligne, grille centrée dessous.
    // Renvoyée à droite comme avant, elle se lisait comme un encart ; ici les
    // deux jeux se comparent d'un coup d'œil, colonne pour colonne.
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        data-player={player.id}
        className={`${frame} w-full max-w-[26rem] flex-col`}
      >
        <div className="shrink-0">{identity}</div>
        <div className="fit-box min-h-0 flex-1">
          <div className="fit-square">
            <PlayerGrid grid={player.grid} size="sm" playerId={player.id} {...echoFor(player.id, echo)} />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      data-player={player.id}
      className={`${frame} min-w-[7.5rem] max-w-[13rem] flex-1 flex-col`}
    >
      <div className="shrink-0">{identity}</div>

      <div className="fit-box min-h-0 flex-1">
        <div className="fit-square">
          <PlayerGrid grid={player.grid} size="sm" playerId={player.id} {...echoFor(player.id, echo)} />
        </div>
      </div>

      {/* Les deux chiffres, en bas, sur toute la largeur du panneau.
          C'était une jauge, qui disait la même chose que le total en moins
          précis ; et le total lui-même vivait dans une ligne tronquée à côté du
          nom, où « 126 pts » s'affichait « 126… ». Surtout, la somme de la
          manche n'apparaissait nulle part au-delà de deux joueurs — or c'est
          elle qui décide de quand on ferme, et la reconstituer de tête sur
          trois grilles de vingt-trois pixels n'est pas une option. La couleur
          du total reprend ce que la jauge disait : il vire au rouge en
          approchant du seuil. */}
      <div className="mt-1 shrink-0">
        <ScoreTiles
          round={player.visibleSum}
          total={player.totalScore}
          target={target}
          size="xs"
          full
        />
      </div>
    </button>
  );
}

/**
 * La grille d'un adversaire en grand, quand on veut vraiment la détailler — et
 * l'endroit où l'on choisit la carte qu'on lui vole.
 *
 * Les deux usages tiennent dans la même fiche : c'est la seule vue de
 * l'application où une carte adverse fait la taille d'un doigt.
 */
export function OpponentSheet({
  player,
  active,
  closer,
  target,
  onPick,
  onClose,
}: {
  player: ViewPlayer;
  active: boolean;
  closer: boolean;
  target: number;
  /** Non nul pendant un Vol : tape une de ses cartes pour l'échanger. */
  onPick?: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-felt-900/70 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="safe-bottom w-full max-w-sm rounded-t-3xl border border-white/12 bg-felt-800/95 p-5 shadow-2xl sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={SETTLE}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar player={player} active={active} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold">{player.name}</div>
          </div>
          <ScoreTiles round={player.visibleSum} total={player.totalScore} target={target} />
          {closer && (
            <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[0.62rem] font-bold text-danger">
              a fermé
            </span>
          )}
        </div>

        {onPick && (
          <p className="mb-2 rounded-xl border border-steal/50 bg-steal/12 px-3 py-2 text-center text-[0.72rem] font-semibold text-steal">
            Tape la carte que tu prends, même un dos — la tienne part à sa place.
          </p>
        )}

        {/* Toutes ses cartes sont à prendre, les dos compris : ce qui reste
            impossible, c'est une case déjà vidée par une élimination. */}
        <PlayerGrid
          grid={player.grid}
          size="md"
          isTarget={onPick ? (index) => !!player.grid[index] : undefined}
          onCell={onPick}
        />

        <div className="mt-4">
          <ScoreMeter score={player.totalScore} target={target} />
          <p className="mt-1.5 text-center text-[0.65rem] text-ink-faint">
            la partie s’arrête à {target} points
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold active:scale-[0.98]"
        >
          Fermer
        </button>
      </motion.div>
    </motion.div>
  );
}
