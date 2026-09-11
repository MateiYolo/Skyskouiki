'use client';

import { memo } from 'react';
import { Avatar, ScoreTiles } from './PlayerPanel';
import { PlayerGrid, type ClearEcho, type SelectedTone } from './PlayerGrid';
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
  /** Faux quand *toutes* les cases sont jouables : entourer les douze n'apprend rien. */
  markTargets: boolean;
  onCell: (index: number) => void;
  touched: number | readonly number[] | null;
  /** Ma carte désignée pour un Vol ou une Valse, le temps de choisir l'autre. */
  selected: number | null;
  /** Laquelle des deux : la marque en prend la couleur. */
  selectedTone: SelectedTone;
  cleared: ClearEcho | null;
  echoKey: number;
  /** Cases retournées sous le doigt, en attente de leur valeur. */
  revealing: readonly number[];
}

/**
 * Mémoïsée : l'écran de jeu porte une demi-douzaine d'états qui n'ont rien à
 * voir avec la table — une annonce d'erreur qui s'efface, le menu ⚙, la fiche
 * d'un adversaire, la préférence de son. Chacun redessinait les douze cartes.
 */
export const MyBoard = memo(function MyBoard({
  view,
  me,
  myTurn,
  isTarget,
  markTargets,
  onCell,
  touched,
  selected,
  selectedTone,
  cleared,
  echoKey,
  revealing,
}: MyBoardProps) {
  const flag =
    view.roundCloserId === view.you.id
      ? 'tu as fermé'
      : view.finalTurnsLeft !== null
        ? 'dernier tour'
        : null;

  return (
    <div className="safe-bottom board-cap mx-auto flex min-h-0 w-full max-w-[26rem] flex-[5] flex-col px-3 pt-1.5">
      {/* Mon nom sert de repère, mes deux scores sont l'information : le compte
          des dos, lui, se lit sur la grille juste en dessous. */}
      <div className="mb-1.5 flex shrink-0 items-center gap-2">
        <Avatar player={me} active={myTurn} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8rem] font-semibold leading-tight">{me.name}</div>
          {/* Une pastille pleine, pas une ligne de texte fin : c'est l'état qui
              décide de tout le reste du coup, il doit se voir depuis la grille
              sans qu'on ait à relire l'en-tête. */}
          {flag && (
            <span className="mt-0.5 inline-block rounded-full bg-danger/20 px-1.5 py-px text-[0.6rem] font-black uppercase tracking-[0.08em] leading-tight text-danger">
              {flag}
            </span>
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
            markTargets={markTargets}
            onCell={onCell}
            touched={touched}
            selected={selected}
            selectedTone={selectedTone}
            cleared={cleared}
            echoKey={echoKey}
            revealing={revealing}
            playerId={me.id}
          />
        </div>
      </div>
    </div>
  );
})
