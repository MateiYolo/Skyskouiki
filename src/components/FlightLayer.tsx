'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';
import { EASE_OUT } from '@/lib/client/motion';
import { flightsForEvents, onFlights, type FlightRequest } from '@/lib/client/flights';
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
 * DOM (`data-anchor`), on mesure les deux extrémités au moment où le vol est
 * demandé, et on fait glisser une carte de l'une à l'autre par-dessus tout le
 * reste. La carte d'arrivée est déjà en place dessous, donc le vol se fond
 * exactement dans sa destination — rien à masquer, rien à resynchroniser.
 */

interface Flight extends FlightRequest {
  id: number;
  fromRect: DOMRect;
  toRect: DOMRect;
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

  /** Mesure les deux bouts maintenant : après, la mise en page aura bougé. */
  const launch = useCallback((requests: FlightRequest[]) => {
    if (prefersReducedMotion()) return;
    const fresh: Flight[] = [];
    for (const request of requests) {
      const fromRect = rectOf(request.from);
      const toRect = rectOf(request.to);
      if (fromRect && toRect) fresh.push({ ...request, id: nextId++, fromRect, toRect });
    }
    if (fresh.length) setFlights((current) => [...current, ...fresh]);
  }, []);

  // Mes propres coups : lancés au doigt par `useGame`, avant le réseau.
  useEffect(() => onFlights(launch), [launch]);

  // Ceux des autres : on ne les apprend qu'à l'arrivée de leur version.
  useEffect(() => {
    if (view.version === seen.current) return;
    // À l'arrivée sur la partie, `lastEvents` décrit un coup déjà joué : le
    // rejouer ferait voler une carte sans rapport avec ce qu'on vient de voir.
    const firstRender = seen.current === -1;
    seen.current = view.version;
    if (firstRender) return;
    launch(flightsForEvents(view));
  }, [view, launch]);

  if (!flights.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      {flights.map((flight) => (
        <motion.div
          key={flight.id}
          className="absolute"
          initial={{
            opacity: 0,
            left: flight.fromRect.left,
            top: flight.fromRect.top,
            width: flight.fromRect.width,
            height: flight.fromRect.height,
          }}
          animate={{
            opacity: 1,
            left: flight.toRect.left,
            top: flight.toRect.top,
            width: flight.toRect.width,
            height: flight.toRect.height,
          }}
          transition={{
            duration: 0.32,
            delay: flight.delay,
            ease: EASE_OUT,
            opacity: { duration: 0.06, delay: flight.delay },
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
