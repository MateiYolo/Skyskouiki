'use client';

import { motion } from 'motion/react';
import { useMemo } from 'react';

const COLORS = ['#ffcc4d', '#ff5a5f', '#4ade80', '#38bdf8', '#c084fc', '#ffffff'];

/**
 * Dispersion pseudo-aléatoire mais déterministe.
 *
 * `Math.random` rendrait le composant impur et ferait diverger le rendu serveur
 * du rendu client&nbsp;; un haché de l'indice donne le même désordre visuel des
 * deux côtés.
 */
function spread(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Pluie de confettis, purement décorative. */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: spread(i, 1) * 100,
        delay: spread(i, 2) * 0.7,
        duration: 2.1 + spread(i, 3) * 1.6,
        drift: (spread(i, 4) - 0.5) * 120,
        spin: (spread(i, 5) - 0.5) * 720,
        color: COLORS[i % COLORS.length],
        width: 6 + spread(i, 6) * 6,
        height: 9 + spread(i, 7) * 8,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-[-8%] block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
          }}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '112vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.85, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
