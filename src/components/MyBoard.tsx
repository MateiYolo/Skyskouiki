'use client';

import { Avatar } from './PlayerPanel';
import { PlayerGrid, type CellCue } from './PlayerGrid';
import { placementHint } from '@/lib/skyjo';
import type { GameView, ViewPlayer } from '@/lib/skyjo';

/**
 * Ma grille : la plus grande chose de l'écran, et de loin.
 *
 * Elle occupe tout ce que l'en-tête et le socle n'ont pas pris, et se cale sur
 * la plus petite des deux dimensions disponibles (`fit-square`) : les cartes
 * grandissent avec l'écran au lieu de se faire raboter par lui.
 */

export interface MyBoardProps {
  view: GameView;
  me: ViewPlayer;
  myTurn: boolean;
  /** Vrai si le joueur peut agir sur cet index maintenant. */
  isTarget: (index: number) => boolean;
  onCell: (index: number) => void;
}

export function MyBoard({ view, me, myTurn, isTarget, onCell }: MyBoardProps) {
  const held = view.turnStep === 'holding' && view.you.isCurrent ? view.heldCard : null;

  /**
   * Pendant un échange, les douze cases sont légales : un liseré identique
   * partout n'aide personne. On distingue ce que le joueur calculerait lui-même
   * — le solde de l'échange, et le groupe qui saute — à partir des seules
   * cartes qu'il voit déjà.
   */
  const cueFor = (index: number): CellCue | null => {
    if (held === null) return null;
    const hint = placementHint(me.grid, index, held);
    if (!hint) return null;
    if (hint.clears) return { intent: 'combo', combo: true };
    return {
      intent: hint.delta !== null && hint.delta < 0 ? 'good' : 'target',
      delta: hint.delta,
    };
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[26rem] flex-1 flex-col px-3 pt-1">
      <div className="mb-1.5 flex shrink-0 items-center gap-2">
        <Avatar player={me} active={myTurn} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8rem] font-semibold leading-tight">{me.name}</div>
          <div className="tnum text-[0.65rem] leading-tight text-ink-dim">
            {me.totalScore} pts · visible {me.visibleSum}
            {me.faceDownCount > 0 && ` · ${me.faceDownCount} cachées`}
          </div>
        </div>
        {view.roundCloserId === view.you.id && (
          <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[0.6rem] font-bold text-danger">
            tu as fermé
          </span>
        )}
        {view.finalTurnsLeft !== null && view.roundCloserId !== view.you.id && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[0.6rem] font-bold text-accent">
            dernier tour
          </span>
        )}
      </div>

      <div className="fit-box min-h-0 flex-1">
        <div className="fit-square" data-testid="my-grid">
          <PlayerGrid
            grid={me.grid}
            size="lg"
            isTarget={isTarget}
            cueFor={cueFor}
            onCell={onCell}
            layoutKey="me"
          />
        </div>
      </div>
    </div>
  );
}
