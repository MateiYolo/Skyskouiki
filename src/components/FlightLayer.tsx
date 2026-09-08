'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';
import { ARC_EASE, EASE_TRAVEL, FLIGHT_DURATION } from '@/lib/client/motion';
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
 * exactement dans sa destination — rien à resynchroniser.
 *
 * Une seule chose se masque : la case qu'un échange va remplacer. Son contenu
 * a déjà changé dans l'état, si bien qu'on verrait la carte posée *avant* de
 * la voir arriver — deux exemplaires de la même carte, l'un attendant l'autre.
 * On garde donc l'ancienne carte par-dessus (`hold`) jusqu'à ce qu'elle s'en
 * aille à son tour, et la nouvelle se glisse dessous.
 *
 * Trois choses le rendent lisible plutôt que rapide :
 *
 *   - **il prend son temps** (`FLIGHT_DURATION`). En un tiers de seconde on ne
 *     suit pas une carte du regard, on constate qu'un écran a changé ;
 *   - **il passe au-dessus** : la carte s'élève au milieu du trajet et se pose
 *     à l'arrivée. Une ligne droite entre deux points proches se confond avec
 *     un fondu ; une courbe dit d'où ça vient et où ça va ;
 *   - **il ne bouge que des transformes.** Animer `left`/`top`/`width` fait
 *     recalculer la mise en page à chaque image, et une carte qui traverse un
 *     téléphone en cinquante étapes de mise en page ne glisse pas, elle
 *     sautille. La carte est posée une fois à son point de départ, puis
 *     seulement translatée et mise à l'échelle.
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

/**
 * La hauteur de l'arc : un dixième de la distance parcourue, borné.
 *
 * Proportionnel, parce qu'un saut de vingt pixels pour traverser l'écran ne se
 * voit pas, et qu'un saut de vingt pixels pour aller d'une case à sa voisine
 * ressemble à un sursaut. Borné, parce qu'au-delà la carte sort du terrain.
 */
function liftOf(distance: number): number {
  return Math.min(34, Math.max(8, distance * 0.11));
}

/**
 * Une carte en vol.
 *
 * Deux calques imbriqués, et il faut les deux : le trajet est une
 * interpolation unique du départ à l'arrivée, le saut est une parabole
 * par-dessus. Mis dans la même animation, le sommet de l'arc devient une étape
 * du trajet — la carte y ralentit, s'arrête, puis repart. C'est exactement ce
 * qu'on ne veut pas voir.
 */
function Flying({ flight, onDone }: { flight: Flight; onDone: (id: number) => void }) {
  const { id, fromRect, toRect, delay, hold } = flight;
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const duration = hold ?? FLIGHT_DURATION;

  // Le retrait ne dépend pas de la fin d'une animation en particulier : une
  // carte qui attend sur place n'en a aucune, et une carte en vol en a trois.
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), (delay + duration) * 1000 + 60);
    return () => clearTimeout(timer);
  }, [id, delay, duration, onDone]);

  const card = (
    <PlayingCard value={flight.value} faceUp={flight.value !== null} size="md" fill />
  );

  // Carte posée : elle couvre sa case le temps qu'on la remplace, sans bouger.
  if (hold) {
    return (
      <div
        className="absolute"
        style={{
          left: fromRect.left,
          top: fromRect.top,
          width: fromRect.width,
          height: fromRect.height,
        }}
      >
        {card}
      </div>
    );
  }

  return (
    <div
      className="absolute"
      style={{
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        height: fromRect.height,
      }}
    >
      {/* Le trajet, d'un seul tenant. L'échelle rattrape la différence de
          taille entre les deux emplacements — une carte de pioche est plus
          petite qu'une case de ma grille — sans toucher à la mise en page. */}
      <motion.div
        className="h-full w-full"
        style={{ transformOrigin: 'top left' }}
        initial={{ opacity: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 }}
        animate={{
          opacity: 1,
          x: dx,
          y: dy,
          scaleX: toRect.width / fromRect.width,
          scaleY: toRect.height / fromRect.height,
        }}
        transition={{
          duration,
          delay,
          ease: EASE_TRAVEL,
          opacity: { duration: 0.08, delay },
        }}
      >
        {/* Le saut par-dessus la table, superposé au trajet. */}
        <motion.div
          className="h-full w-full"
          initial={{ y: 0, scale: 1 }}
          animate={{ y: [0, -liftOf(Math.hypot(dx, dy)), 0], scale: [1, 1.07, 1] }}
          transition={{ duration, delay, times: [0, 0.5, 1], ease: [...ARC_EASE] }}
          style={{ filter: 'drop-shadow(0 12px 26px rgb(0 0 0 / 0.6))' }}
        >
          {card}
        </motion.div>
      </motion.div>
    </div>
  );
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

  const remove = useCallback((id: number) => {
    setFlights((current) => current.filter((f) => f.id !== id));
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
        <Flying key={flight.id} flight={flight} onDone={remove} />
      ))}
    </div>
  );
}
