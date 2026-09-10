'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { EASE_OUT, FLIGHT_DURATION, GAUGE_FILL, MOVE } from '@/lib/client/motion';
import type { ViewPlayer } from '@/lib/skyjo';

/**
 * Jauge de danger : on ne veut surtout pas la remplir.
 *
 * Sur la table, elle se contente d'afficher où en est un joueur. Sur la feuille
 * de scores, elle a un autre travail : montrer le *chemin parcouru* pendant la
 * manche. D'où `from` — la jauge part de l'ancien total, se remplit de gauche à
 * droite en freinant à l'arrivée, et laisse derrière elle la portion qui vient
 * d'être perdue, éclairée le temps qu'on la voie. Sans ça, elle apparaissait
 * déjà pleine : le score changeait, la barre non.
 */
export function ScoreMeter({
  score,
  target,
  from,
  delay = 0,
  thick = false,
}: {
  score: number;
  target: number;
  /** Total d'avant la manche : la jauge part de là. Omis, elle se pose à sa valeur. */
  from?: number;
  /** Attente avant le remplissage, pour que les lignes montent l'une après l'autre. */
  delay?: number;
  /** Un peu plus haute : sur la feuille de scores, c'est elle qu'on regarde. */
  thick?: boolean;
}) {
  const ratio = Math.max(0, Math.min(1, score / target));
  const start = from === undefined ? ratio : Math.max(0, Math.min(1, from / target));
  const grows = start < ratio;
  const hot = ratio > 0.75;
  const fill = hot
    ? 'linear-gradient(90deg, #ffb347, #ff5a5f)'
    : 'linear-gradient(90deg, #4ade80, #ffcc4d)';

  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-white/10 ${thick ? 'h-1.5' : 'h-1'}`}>
      {/* Ce que la manche vient de coûter, en clair derrière la jauge : la barre
          la recouvre en montant, donc on voit exactement quelle part du chemin
          est neuve. */}
      {grows && (
        <motion.div
          className="absolute inset-y-0 rounded-full bg-white/45"
          style={{ left: `${start * 100}%`, width: `${(ratio - start) * 100}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            duration: GAUGE_FILL + 0.5,
            delay,
            times: [0, 0.12, 0.72, 1],
            ease: 'linear',
          }}
        />
      )}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: fill }}
        initial={grows ? { width: `${start * 100}%` } : false}
        animate={{ width: `${ratio * 100}%` }}
        transition={grows ? { duration: GAUGE_FILL, delay, ease: EASE_OUT } : MOVE}
      />
    </div>
  );
}

/**
 * Les deux seuls chiffres qui comptent, côte à côte et lisibles de loin.
 *
 * « manche » est le total des cartes déjà retournées : ce qu'on encaisserait si
 * la manche s'arrêtait maintenant, le compte qu'on surveille à chaque échange.
 * « total » est le cumul de la partie, celui qui décide qui perd. Les compter
 * dans une ligne de texte fin les rendait invisibles ; ici ils ont la taille de
 * leur importance, et le total vire au rouge à l'approche du seuil.
 */
export function ScoreTiles({
  round,
  total,
  target,
  size = 'md',
}: {
  round: number;
  total: number;
  target: number;
  size?: 'sm' | 'md';
}) {
  const hot = total >= target * 0.75;
  const num = size === 'sm' ? 'text-[0.95rem]' : 'text-[1.15rem]';
  const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <div className="flex shrink-0 items-stretch gap-1">
      <Tile
        label="manche"
        value={round}
        num={num}
        pad={pad}
        className="bg-white/[0.07] text-ink"
        delta
      />
      <Tile
        label="total"
        value={total}
        num={num}
        pad={pad}
        className={hot ? 'bg-danger/20 text-danger' : 'bg-accent/15 text-accent'}
      />
    </div>
  );
}

/**
 * Le dernier changement de ce chiffre, tant qu'il est frais.
 *
 * Le premier rendu n'en produit pas : une tuile qui apparaît à l'ouverture
 * d'une fiche adverse ne vient de rien.
 */
let nextDeltaId = 1;

function useDelta(value: number): { id: number; delta: number } | null {
  const [delta, setDelta] = useState<{ id: number; delta: number } | null>(null);
  const previous = useRef<number | null>(null);

  // Réaction à un chiffre qui arrive du serveur, pas à un rendu.
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === null || before === value) return;
    setDelta({ id: nextDeltaId++, delta: value - before });
  }, [value]);

  return delta;
}

/**
 * Un chiffre, et ce que le dernier coup lui a fait.
 *
 * C'est le seul retour chiffré de l'écran de jeu, et il est là pour une raison
 * précise : sans lui, retourner un 12 et retourner un -2 se ressemblent — la
 * grille change, un nombre change quelque part, et rien ne dit lequel des deux
 * vient de faire mal. Le « +12 » qui s'échappe de la tuile relie le geste à sa
 * conséquence, et c'est ce lien-là qu'on vient rechercher au coup suivant.
 *
 * Il arrive une demi-seconde après le geste, pas avec lui : le temps que la
 * carte se pose. Une conséquence qui devance sa cause n'en est plus une.
 */
function Tile({
  label,
  value,
  num,
  pad,
  className,
  delta = false,
}: {
  label: string;
  value: number;
  num: string;
  pad: string;
  className: string;
  /** Annoncer les variations. Réservé au score de la manche : le cumul, lui,
      ne bouge qu'entre deux manches, feuille de scores à l'appui. */
  delta?: boolean;
}) {
  const change = useDelta(value);
  const shown = delta ? change : null;

  return (
    <motion.div
      className={`relative flex flex-col items-center justify-center rounded-xl ${pad} ${className}`}
      animate={shown ? { scale: [1, 1.09, 1] } : { scale: 1 }}
      key={shown?.id ?? 'still'}
      transition={{ duration: 0.34, delay: shown ? FLIGHT_DURATION : 0, ease: 'easeOut' }}
    >
      <span className="text-[0.5rem] font-semibold uppercase leading-none tracking-[0.12em] opacity-70">
        {label}
      </span>
      <span className={`tnum font-black leading-tight ${num}`}>{value}</span>

      <AnimatePresence>
        {shown && (
          <motion.span
            key={shown.id}
            className="pointer-events-none absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.68rem] font-black"
            style={{
              // Au Skyjo, monter c'est perdre : la couleur dit le sens avant
              // que le chiffre ne soit lu.
              color: shown.delta > 0 ? 'var(--color-danger)' : 'var(--color-good)',
              textShadow: '0 1px 6px rgb(11 7 22 / 0.9)',
            }}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: [0, 1, 1, 0], y: [2, -9, -13, -19] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.1,
              delay: FLIGHT_DURATION,
              times: [0, 0.16, 0.6, 1],
              ease: 'easeOut',
            }}
          >
            {shown.delta > 0 ? '+' : '−'}
            {Math.abs(shown.delta)}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function Avatar({
  player,
  active,
  size = 'md',
}: {
  player: ViewPlayer;
  active: boolean;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-base' : 'h-10 w-10 text-xl';
  // « C'est son tour » est un état, pas un événement : un anneau fixe le dit
  // aussi bien qu'une pastille qui bat, sans tirer l'œil en permanence.
  return (
    <div
      className={`relative grid ${dim} shrink-0 place-items-center rounded-full bg-white/10`}
      style={
        active
          ? { boxShadow: '0 0 0 2px var(--color-accent), 0 0 16px rgb(255 204 77 / 0.4)' }
          : undefined
      }
    >
      <span aria-hidden>{player.emoji}</span>
      {!player.connected && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white/40 ring-2 ring-felt-900"
          title="Déconnecté"
        />
      )}
    </div>
  );
}
