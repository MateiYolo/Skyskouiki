'use client';

import { Avatar, ScoreTiles } from './PlayerPanel';
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

  const flag =
    view.roundCloserId === view.you.id
      ? 'tu as fermé'
      : view.finalTurnsLeft !== null
        ? 'dernier tour'
        : null;

  return (
    <div className="board-cap mx-auto flex min-h-0 w-full max-w-[26rem] flex-[5] flex-col px-3 pt-1">
      {/* Mon nom sert de repère, mes deux scores sont l'information : le compte
          des dos, lui, se lit sur la grille juste en dessous. */}
      <div className="mb-1.5 flex shrink-0 items-center gap-2">
        <Avatar player={me} active={myTurn} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8rem] font-semibold leading-tight">{me.name}</div>
          {flag && (
            <div
              className={`text-[0.6rem] font-bold leading-tight ${
                flag === 'tu as fermé' ? 'text-danger' : 'text-accent'
              }`}
            >
              {flag}
            </div>
          )}
        </div>
        <ScoreTiles round={me.visibleSum} total={me.totalScore} target={view.targetScore} />
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
