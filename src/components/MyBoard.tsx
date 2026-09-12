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
  /**
   * La seule chose que cet en-tête a à dire sur la fin de manche : que c'est
   * *moi* qui l'ai déclenchée.
   *
   * Elle disait aussi « dernier tour » quand quelqu'un d'autre avait fermé —
   * mais à cet instant-là, l'annonce, la consigne passée au rouge et le liseré
   * de l'écran le disaient déjà : quatre fois le même mot au même moment. Reste
   * ce qu'aucun des trois ne dit, et qui répond à la bande des adversaires où
   * le voisin qui a fermé porte le même marquage.
   */
  const closedByMe = view.roundCloserId === view.you.id;

  return (
    <div className="safe-bottom board-cap mx-auto flex min-h-0 w-full max-w-[26rem] flex-[5] flex-col px-3 pt-1.5">
      {/* Mon nom sert de repère, mes deux scores sont l'information : le compte
          des dos, lui, se lit sur la grille juste en dessous. */}
      <div className="mb-1.5 flex shrink-0 items-center gap-2">
        <Avatar player={me} active={myTurn} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8rem] font-semibold leading-tight">{me.name}</div>
          {/* `block` et `leading-none`, et pas une bribe en ligne : posée dans
              une ligne de texte, elle héritait de l'interligne du bloc et
              dépassait d'un cheveu les tuiles de score, ce qui suffisait à
              pousser la grille d'un pixel au moment exact où la manche se
              ferme. Aplatie, elle tient dans la hauteur que l'en-tête a déjà. */}
          {closedByMe && (
            <span className="mt-0.5 block w-fit rounded-full bg-danger/20 px-1.5 py-0.5 text-[0.6rem] font-black uppercase leading-none tracking-[0.08em] text-danger">
              tu as fermé
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
