'use client';

import { motion } from 'motion/react';
import { Avatar, ScoreMeter, ScoreTiles } from './PlayerPanel';
import { PlayerGrid } from './PlayerGrid';
import type { GameView, LastMove, ViewPlayer } from '@/lib/skyjo';

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
 * grilles adverses. À huit joueurs, la bande défile.
 */

interface Props {
  view: GameView;
  opponents: ViewPlayer[];
  move: LastMove | null;
  onOpen: (playerId: string) => void;
}

export function OpponentStrip({ view, opponents, move, onOpen }: Props) {
  // À deux — le cas de loin le plus fréquent — l'unique adversaire s'étale en
  // largeur : ses infos passent à gauche et toute la hauteur du panneau revient
  // à sa grille. À plusieurs, chacun reprend une colonne et la bande défile.
  const solo = opponents.length === 1;

  return (
    <div
      className={[
        'no-scrollbar flex min-h-0 max-h-[13rem] flex-[2] gap-2 overflow-x-auto px-3 pb-1',
        opponents.length > 3 ? 'fade-right' : 'justify-center',
      ].join(' ')}
    >
      {opponents.map((player) => (
        <OpponentPanel
          key={player.id}
          player={player}
          solo={solo}
          active={player.id === view.currentPlayerId}
          closer={player.id === view.roundCloserId}
          target={view.targetScore}
          move={move?.playerId === player.id ? move.text : null}
          onOpen={() => onOpen(player.id)}
        />
      ))}
    </div>
  );
}

interface PanelProps {
  player: ViewPlayer;
  solo: boolean;
  active: boolean;
  closer: boolean;
  target: number;
  move: string | null;
  onOpen: () => void;
}

function OpponentPanel({ player, solo, active, closer, target, move, onOpen }: PanelProps) {
  const identity = (
    <>
      <div className="flex items-center gap-1.5">
        <Avatar player={player} active={active} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.72rem] font-semibold leading-tight">{player.name}</div>
          {/* En colonne étroite la ligne passait à deux : on s'en tient au cumul,
              le nombre de dos se compte sur la grille juste en dessous. */}
          {!solo && (
            <div className="tnum truncate text-[0.62rem] leading-tight text-ink-dim">
              {player.totalScore} pts
            </div>
          )}
        </div>
        {solo && <ScoreTiles round={player.visibleSum} total={player.totalScore} target={target} size="sm" />}
        {closer && (
          <span className="shrink-0 rounded-full bg-danger/20 px-1.5 py-px text-[0.55rem] font-bold text-danger">
            fermé
          </span>
        )}
      </div>

      {/* Hauteur réservée : le dernier coup apparaît sans pousser la grille. */}
      <div className="h-[0.95rem] truncate text-[0.6rem] leading-[0.95rem] text-accent/85">
        {move}
      </div>
    </>
  );

  const frame = [
    'flex min-h-0 shrink-0 rounded-2xl border p-1.5 text-left transition-colors',
    active ? 'border-accent/60 bg-accent/10' : 'border-white/10 bg-white/[0.04]',
  ].join(' ');

  const label = `Voir la grille de ${player.name} en grand — ${player.totalScore} points au total, ${player.visibleSum} sur la manche`;

  if (solo) {
    return (
      <button type="button" onClick={onOpen} aria-label={label} className={`${frame} w-full max-w-[26rem] items-stretch gap-2`}>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {identity}
          <ScoreMeter score={player.totalScore} target={target} />
        </div>
        {/* Carrée par la hauteur du panneau ; le garde-fou de largeur évite
            qu'un écran très court et étroit ne la fasse déborder. */}
        <div className="h-full max-w-[62%] shrink-0" style={{ aspectRatio: '1' }}>
          <PlayerGrid grid={player.grid} size="sm" />
        </div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} aria-label={label} className={`${frame} min-w-[7.5rem] max-w-[13rem] flex-1 flex-col`}>
      <div className="shrink-0">{identity}</div>

      <div className="fit-box min-h-0 flex-1">
        <div className="fit-square">
          <PlayerGrid grid={player.grid} size="sm" />
        </div>
      </div>

      <div className="mt-1 shrink-0">
        <ScoreMeter score={player.totalScore} target={target} />
      </div>
    </button>
  );
}

/** La grille d'un adversaire en grand, quand on veut vraiment la détailler. */
export function OpponentSheet({
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
          </div>
          <ScoreTiles round={player.visibleSum} total={player.totalScore} target={target} />
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
