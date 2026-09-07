'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Avatar, ScoreMeter } from './PlayerPanel';
import { PlayerGrid } from './PlayerGrid';
import type { GameView, ViewPlayer } from '@/lib/skyjo';

/**
 * Les adversaires, en bandeau.
 *
 * Ils tenaient la moitié de l'écran en vignettes détaillées, pendant que le
 * joueur ne voyait plus sa propre grille. Ici ils tiennent une ligne : de quoi
 * suivre qui joue et qui approche du seuil, sans plus. Le détail est à un
 * doigt — on ouvre la grille d'un adversaire quand on veut vraiment la lire,
 * ce qui est de toute façon un geste délibéré, pas un coup d'œil permanent.
 */

interface Props {
  view: GameView;
  opponents: ViewPlayer[];
}

export function OpponentStrip({ view, opponents }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Résolu à chaque rendu : un adversaire qui quitte la partie referme sa fiche
  // sans qu'un effet ait à courir après l'état.
  const open = opponents.find((p) => p.id === openId) ?? null;

  return (
    <>
      <div
        className={[
          'no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-1.5',
          opponents.length <= 2 ? 'justify-center' : 'fade-right',
        ].join(' ')}
      >
        {opponents.map((player) => (
          <OpponentChip
            key={player.id}
            player={player}
            active={player.id === view.currentPlayerId}
            closer={player.id === view.roundCloserId}
            target={view.targetScore}
            onOpen={() => setOpenId(player.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {open && (
          <OpponentSheet
            player={open}
            active={open.id === view.currentPlayerId}
            closer={open.id === view.roundCloserId}
            target={view.targetScore}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function OpponentChip({
  player,
  active,
  closer,
  target,
  onOpen,
}: {
  player: ViewPlayer;
  active: boolean;
  closer: boolean;
  target: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Voir la grille de ${player.name}, ${player.totalScore} points`}
      className={[
        'flex w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl border px-2 py-1.5 text-left transition-colors active:scale-[0.98]',
        active ? 'border-accent/60 bg-accent/10' : 'border-white/10 bg-white/[0.04]',
      ].join(' ')}
    >
      <Avatar player={player} active={active} size="sm" />

      <div className="min-w-0 flex-1">
        {/* Le nom garde la ligne pour lui seul : accolé à un badge, il se faisait
            tronquer à la première lettre. */}
        <div className="truncate text-[0.72rem] font-semibold">{player.name}</div>
        <div className="tnum text-[0.62rem] text-ink-dim">
          {player.totalScore} pts ·{' '}
          {closer ? (
            <span className="font-bold text-danger">fermé</span>
          ) : (
            player.visibleSum
          )}
        </div>
        <div className="mt-1">
          <ScoreMeter score={player.totalScore} target={target} />
        </div>
      </div>

      {/* Aperçu : on y lit la couleur dominante et le nombre de dos, pas les chiffres. */}
      <div className="w-[2.6rem] shrink-0" aria-hidden>
        <PlayerGrid grid={player.grid} size="xs" />
      </div>
    </button>
  );
}

function OpponentSheet({
  player,
  active,
  closer,
  target,
  onClose,
}: {
  player: ViewPlayer;
  active: boolean;
  closer: boolean;
  target: number;
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
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar player={player} active={active} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold">{player.name}</div>
            <div className="tnum text-[0.72rem] text-ink-dim">
              {player.totalScore} pts · visible {player.visibleSum} · {player.faceDownCount} cachées
            </div>
          </div>
          {closer && (
            <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[0.62rem] font-bold text-danger">
              a fermé
            </span>
          )}
        </div>

        <PlayerGrid grid={player.grid} size="md" />

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
