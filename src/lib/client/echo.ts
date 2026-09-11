'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameView } from '@/lib/skyjo';
import { clearDelay } from './flights';
import type { ClearEcho } from '@/components/PlayerGrid';

/**
 * Le dernier coup, traduit en quelque chose que les grilles peuvent montrer.
 *
 * Le serveur diffuse à tout le monde les événements de la dernière action, mais
 * il diffuse aussi l'état *après* : la carte est déjà retournée, la colonne
 * déjà vide. Sans rejouer le geste, une partie à distance se résume à des
 * grilles qui changent toutes seules — on ne sait ni où l'autre a joué, ni
 * pourquoi trois de ses cartes ont disparu.
 *
 * Ce module ne fait que ça : dire, par joueur, quelle case vient d'être touchée
 * et quel groupe vient de sauter. Les composants s'occupent de l'animer.
 */

export interface MoveEcho {
  /** Version de la partie : sert de clé pour rejouer l'animation à chaque coup. */
  version: number;
  /**
   * Par joueur, la ou les cases qu'il vient de jouer.
   *
   * Une seule suffisait tant qu'un coup ne touchait qu'une carte par grille.
   * La Valse en bouge deux d'un coup, dans la même grille : n'en désigner
   * qu'une ferait croire que l'autre n'a pas bougé.
   */
  touched: Record<string, number | number[]>;
  /** Par joueur, le groupe qu'il vient d'éliminer. */
  cleared: Record<string, ClearEcho>;
  /** Pile où la dernière carte a été prise : elle s'allume au passage. */
  drewFrom: 'draw' | 'discard' | null;
}

export function useMoveEcho(view: GameView | null): MoveEcho | null {
  const [echo, setEcho] = useState<MoveEcho | null>(null);
  const seen = useRef(-1);

  useEffect(() => {
    if (!view || view.version === seen.current) return;
    // Au premier rendu on hérite du dernier coup joué avant d'arriver : le
    // rejouer ferait clignoter une case sans rapport avec ce qu'on vient de voir.
    const firstRender = seen.current === -1;
    seen.current = view.version;
    if (firstRender) return;

    const touched: Record<string, number | number[]> = {};
    const cleared: Record<string, ClearEcho> = {};
    let drewFrom: 'draw' | 'discard' | null = null;

    for (const event of view.lastEvents) {
      switch (event.type) {
        case 'placed':
        case 'flipped':
        case 'initialFlip':
          touched[event.playerId] = event.index;
          break;
        // Un vol touche deux grilles d'un coup, une case dans chacune : c'est
        // exactement ce que ce relevé sait porter, une case par joueur.
        case 'stole':
          touched[event.playerId] = event.index;
          touched[event.targetPlayerId] = event.targetIndex;
          break;
        // Une Valse, elle, touche deux cases d'une seule grille.
        case 'swapped':
          touched[event.playerId] = [event.index, event.otherIndex];
          break;
        case 'drew':
          drewFrom = event.from;
          break;
        case 'groupCleared':
          // Les cases viennent de l'événement, jamais de la géométrie du
          // groupe : une ligne déjà trouée par une colonne éliminée n'en
          // compte pas quatre, et un fantôme sur le trou serait un mensonge.
          cleared[event.playerId] = {
            indices: event.cells,
            value: event.value,
            jokers: event.jokers ?? [],
            // Les cartes restent en place jusque-là, puis partent à la
            // défausse (cf. `flightsForEvents`). Le même instant des deux
            // côtés : le fantôme s'efface pile quand la carte décolle.
            delay: clearDelay(view),
          };
          break;
        default:
          break;
      }
    }

    setEcho({ version: view.version, touched, cleared, drewFrom });
  }, [view]);

  return echo;
}
