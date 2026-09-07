'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';
import { EASE_OUT } from '@/lib/client/motion';
import type { GameView } from '@/lib/skyjo';

/**
 * Les cartes qui voyagent.
 *
 * C'est ce qui sépare « la grille d'en face a changé » de « il a pris le 9 de
 * la défausse et l'a posé là, en jetant son 12 ». Le serveur nous livre l'état
 * d'après ; sans rejouer le trajet, une partie à distance se lit comme un
 * tableau de scores qui se met à jour tout seul.
 *
 * Le principe est volontairement bête : les emplacements se déclarent dans le
 * DOM (`data-anchor`), on mesure les deux extrémités au moment où la nouvelle
 * version arrive, et on fait glisser une carte de l'une à l'autre par-dessus
 * tout le reste. La carte d'arrivée est déjà en place dessous, donc le vol se
 * fond exactement dans sa destination — rien à masquer, rien à resynchroniser.
 */

/** Emplacements déclarés par les composants, en `data-anchor`. */
export const DRAW_PILE = 'pile-draw';
export const DISCARD_PILE = 'pile-discard';
export const HAND = 'hand';
export const cellAnchor = (playerId: string, index: number) => `cell-${playerId}-${index}`;

interface Flight {
  id: number;
  from: DOMRect;
  to: DOMRect;
  value: number | null;
  delay: number;
}

let nextId = 1;

/** Le premier emplacement visible portant cette ancre. */
function rectOf(anchor: string): DOMRect | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-anchor="${anchor}"]`);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FlightLayer({ view }: { view: GameView }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seen = useRef(-1);

  useEffect(() => {
    if (view.version === seen.current) return;
    // À l'arrivée sur la partie, `lastEvents` décrit un coup déjà joué : le
    // rejouer ferait voler une carte sans rapport avec ce qu'on vient de voir.
    const firstRender = seen.current === -1;
    seen.current = view.version;
    if (firstRender || prefersReducedMotion()) return;

    const fresh: Flight[] = [];
    const fly = (from: string, to: string, value: number | null, delay: number) => {
      const a = rectOf(from);
      const b = rectOf(to);
      if (a && b) fresh.push({ id: nextId++, from: a, to: b, value, delay });
    };

    for (const event of view.lastEvents) {
      switch (event.type) {
        case 'drew':
          // Face visible seulement si le serveur nous a donné la valeur : la
          // mienne toujours, celle d'un adversaire s'il l'a prise à la défausse.
          fly(event.from === 'draw' ? DRAW_PILE : DISCARD_PILE, HAND, view.heldCard, 0);
          break;
        case 'placed':
          // Deux mouvements, décalés : la carte se pose, puis celle qu'elle
          // remplace part à la défausse. Simultanés, on ne lirait ni l'un ni l'autre.
          fly(HAND, cellAnchor(event.playerId, event.index), event.placed, 0);
          fly(cellAnchor(event.playerId, event.index), DISCARD_PILE, event.discarded, 0.16);
          break;
        case 'discarded':
          fly(HAND, DISCARD_PILE, event.value, 0);
          break;
        default:
          break;
      }
    }

    // Réaction à une nouvelle version reçue du serveur, mesurée sur le DOM :
    // c'est bien la synchronisation avec un système extérieur à React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh.length) setFlights((current) => [...current, ...fresh]);
  }, [view]);

  if (!flights.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      {flights.map((flight) => (
        <motion.div
          key={flight.id}
          className="absolute"
          initial={{
            opacity: 0,
            left: flight.from.left,
            top: flight.from.top,
            width: flight.from.width,
            height: flight.from.height,
          }}
          animate={{
            opacity: 1,
            left: flight.to.left,
            top: flight.to.top,
            width: flight.to.width,
            height: flight.to.height,
          }}
          transition={{
            duration: 0.38,
            delay: flight.delay,
            ease: EASE_OUT,
            opacity: { duration: 0.08, delay: flight.delay },
          }}
          onAnimationComplete={() =>
            setFlights((current) => current.filter((f) => f.id !== flight.id))
          }
          style={{ filter: 'drop-shadow(0 10px 22px rgb(0 0 0 / 0.55))' }}
        >
          <PlayingCard value={flight.value} faceUp={flight.value !== null} size="md" fill />
        </motion.div>
      ))}
    </div>
  );
}
