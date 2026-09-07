'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cue } from '@/lib/client/feedback';
import type { GameEvent, GameView } from '@/lib/skyjo';

/**
 * Traduit les événements du moteur en retours visuels, sonores et haptiques.
 *
 * Les deux téléphones reçoivent la même liste d'événements : chacun voit donc
 * aussi ce que l'autre vient de faire, ce qui rend la partie vivante même quand
 * ce n'est pas son tour.
 */

interface Toast {
  id: number;
  text: string;
  tone: 'neutral' | 'good' | 'warn';
}

interface Hero {
  id: number;
  title: string;
  subtitle?: string;
  tone: 'good' | 'warn';
}

let nextId = 1;

export function EventLayer({ view }: { view: GameView }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hero, setHero] = useState<Hero | null>(null);
  const lastVersion = useRef<number>(-1);
  const lastCurrent = useRef<string | null>(null);

  useEffect(() => {
    if (view.version === lastVersion.current) return;
    const firstRender = lastVersion.current === -1;
    lastVersion.current = view.version;

    const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Quelqu’un';
    const emojiOf = (id: string) => view.players.find((p) => p.id === id)?.emoji ?? '';
    const mine = (id: string) => id === view.you.id;

    const fresh: Toast[] = [];
    let freshHero: Hero | null = null;

    for (const event of view.lastEvents as GameEvent[]) {
      switch (event.type) {
        case 'groupCleared': {
          cue('clear');
          const row = event.kind === 'row';
          if (mine(event.playerId)) {
            freshHero = {
              id: nextId++,
              title: row ? 'LIGNE !' : 'COLONNE !',
              subtitle: row
                ? `Quatre ${event.value} d’un coup`
                : `Trois ${event.value} envolés`,
              tone: 'good',
            };
          } else {
            fresh.push({
              id: nextId++,
              text: `${emojiOf(event.playerId)} ${nameOf(event.playerId)} dégage une ${row ? 'ligne' : 'colonne'} de ${event.value}`,
              tone: 'warn',
            });
          }
          break;
        }
        case 'lastTurnTriggered': {
          cue('lastTurn');
          freshHero = mine(event.playerId)
            ? { id: nextId++, title: 'TU FERMES !', subtitle: 'Croise les doigts…', tone: 'warn' }
            : {
                id: nextId++,
                title: 'DERNIER TOUR',
                subtitle: `${nameOf(event.playerId)} a tout retourné`,
                tone: 'warn',
              };
          break;
        }
        case 'pileReshuffled':
          fresh.push({ id: nextId++, text: 'Pioche reconstituée', tone: 'neutral' });
          break;
        case 'roundStarted':
          if (!firstRender) {
            fresh.push({ id: nextId++, text: `Manche ${event.round}`, tone: 'neutral' });
          }
          break;
        case 'drew':
          if (!mine(view.currentPlayerId ?? '')) cue('draw');
          break;
        case 'placed':
          cue('place');
          break;
        case 'discarded':
          cue('discard');
          break;
        case 'flipped':
        case 'initialFlip':
          cue('flip');
          break;
        case 'gameOver':
          cue(event.winnerId === view.you.id ? 'win' : 'lose');
          break;
        default:
          break;
      }
    }

    // Changement de tour : une petite alerte pour celui qui doit jouer.
    if (
      !firstRender &&
      view.currentPlayerId !== lastCurrent.current &&
      view.currentPlayerId === view.you.id &&
      view.phase === 'playing'
    ) {
      cue('yourTurn');
    }
    lastCurrent.current = view.currentPlayerId;

    // Réaction à une nouvelle version reçue du serveur, au même titre que les
    // sons et les vibrations déclenchés juste au-dessus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh.length) setToasts((t) => [...t, ...fresh].slice(-3));
    if (freshHero) setHero(freshHero);
  }, [view]);

  // Les toasts s'effacent tout seuls.
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 2600);
    return () => clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    if (!hero) return;
    const timer = setTimeout(() => setHero(null), 1500);
    return () => clearTimeout(timer);
  }, [hero]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-40 flex flex-col items-center gap-1.5 px-4">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={[
                'rounded-full border px-3.5 py-1.5 text-[0.72rem] font-medium backdrop-blur-md',
                toast.tone === 'good'
                  ? 'border-good/40 bg-good/15 text-good'
                  : toast.tone === 'warn'
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-white/15 bg-white/10 text-ink-dim',
              ].join(' ')}
            >
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hero && (
          <motion.div
            key={hero.id}
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.6, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 1.25, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            >
              <div
                className="text-4xl font-black tracking-tight"
                style={{
                  color: hero.tone === 'good' ? 'var(--color-good)' : 'var(--color-accent)',
                  textShadow: '0 4px 24px rgb(0 0 0 / 0.7)',
                }}
              >
                {hero.title}
              </div>
              {hero.subtitle && (
                <div className="mt-1 text-sm font-medium text-ink-dim">{hero.subtitle}</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
