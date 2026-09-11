'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cue } from '@/lib/client/feedback';
import { clearDelay } from '@/lib/client/flights';
import { FLIGHT_DURATION, FLIGHT_NEXT, MOVE, SETTLE } from '@/lib/client/motion';
import { cardName } from '@/lib/skyjo';
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

/**
 * L'annonce : la seule chose que le joueur doit lire quand il quitte sa grille
 * des yeux. Une par coup, en clair, et elle vaut pour ce que *n'importe qui*
 * vient de faire — voir « Lisa élimine une colonne de 5 » est exactement ce qui
 * manquait pour suivre la partie d'en face.
 */
interface Hero {
  id: number;
  title: string;
  subtitle?: string;
  /** `alert` est réservé à la fermeture de manche : c'est le seul événement
      qui change les règles du coup suivant. */
  tone: 'good' | 'warn' | 'alert';
  /** Combien de temps elle reste, en millisecondes. Par défaut, le temps de la lire. */
  hold?: number;
}

const HERO_EDGE: Record<Hero['tone'], string> = {
  good: 'rgb(74 222 128 / 0.45)',
  warn: 'rgb(255 204 77 / 0.45)',
  alert: 'rgb(255 90 95 / 0.7)',
};

const HERO_INK: Record<Hero['tone'], string> = {
  good: 'var(--color-good)',
  warn: 'var(--color-accent)',
  alert: 'var(--color-danger)',
};

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
    const mine = (id: string) => id === view.you.id;

    const fresh: Toast[] = [];
    let freshHero: Hero | null = null;

    for (const event of view.lastEvents as GameEvent[]) {
      switch (event.type) {
        case 'groupCleared': {
          // La petite gamme monte pendant que les cartes s'en vont, une note
          // par carte — pas une seconde et demie avant qu'elles ne bougent.
          cue('clear', clearDelay(view));
          const group = event.kind === 'row' ? 'Ligne' : 'Colonne';
          // Le compte vient des cases réellement retirées : une ligne amputée
          // d'une colonne déjà éliminée n'en aligne que trois. Et quand c'est le
          // joker qui a fermé le groupe, le dire : « trois 7 » sur une colonne
          // qui n'en contenait que deux ferait douter de la règle, pas du coup.
          const jokers = (event.jokers ?? []).length;
          const spelled = ['', 'Une', 'Deux', 'Trois', 'Quatre'];
          const what = jokers
            ? `${spelled[event.cells.length - jokers]} ${event.value} et le joker`
            : `${spelled[event.cells.length]} ${event.value}`;
          const where = mine(event.playerId) ? 'chez toi' : `chez ${nameOf(event.playerId)}`;
          freshHero = {
            id: nextId++,
            title: `${group} éliminée`,
            subtitle: `${what} ${where}`,
            tone: mine(event.playerId) ? 'good' : 'warn',
          };
          break;
        }

        // Le Vol se joue en deux temps, et les deux méritent une annonce : la
        // pioche du Vol, parce que tout le monde doit comprendre pourquoi le
        // tour s'arrête là, puis l'échange lui-même, parce que deux grilles
        // changent d'un coup et que la victime n'a rien touché.
        case 'stealDrawn':
          cue('steal');
          freshHero = mine(event.playerId)
            ? {
                id: nextId++,
                title: 'Vol !',
                subtitle: 'Une de tes cartes contre une des leurs, dos compris',
                tone: 'good',
                hold: 2800,
              }
            : {
                id: nextId++,
                title: 'Vol !',
                subtitle: `${nameOf(event.playerId)} choisit son échange`,
                tone: 'alert',
                hold: 2800,
              };
          break;
        case 'stole': {
          // Les deux cartes se croisent d'abord, puis se posent : c'est là que
          // l'échange s'entend.
          cue('steal', FLIGHT_NEXT + FLIGHT_DURATION);
          // Une carte échangée face cachée n'a pas de nom : elle a traversé la
          // table sans se retourner, et l'annonce n'en sait pas plus que la
          // grille.
          const taken = event.taken === null ? 'une carte cachée' : cardName(event.taken);
          const given = event.given === null ? 'une carte cachée' : cardName(event.given);
          if (mine(event.playerId)) {
            freshHero = {
              id: nextId++,
              title: 'Vol réussi',
              subtitle: `Tu prends ${taken} à ${nameOf(event.targetPlayerId)}`,
              tone: 'good',
            };
          } else if (mine(event.targetPlayerId)) {
            freshHero = {
              id: nextId++,
              title: 'On t’a volé !',
              subtitle: `${nameOf(event.playerId)} prend ${taken} et te laisse ${given}`,
              tone: 'alert',
              hold: 3000,
            };
          } else {
            freshHero = {
              id: nextId++,
              title: 'Vol',
              subtitle: `${nameOf(event.playerId)} prend ${taken} à ${nameOf(event.targetPlayerId)}`,
              tone: 'warn',
            };
          }
          break;
        }
        case 'stealDeclined':
          fresh.push({
            id: nextId++,
            text: mine(event.playerId) ? 'Vol laissé de côté' : `${nameOf(event.playerId)} renonce au Vol`,
            tone: 'neutral',
          });
          break;
        // L'annonce la plus importante de la manche, et la seule qu'on ne peut
        // pas rattraper : après elle, il ne reste qu'un coup à jouer. Elle reste
        // donc nettement plus longtemps que les autres, en rouge — et le bandeau
        // du milieu de table prend le relais pour tout le tour.
        case 'lastTurnTriggered': {
          cue('lastTurn');
          freshHero = mine(event.playerId)
            ? {
                id: nextId++,
                title: 'Tu fermes la manche',
                subtitle: 'Le plus petit total, sinon il double',
                tone: 'alert',
                hold: 3400,
              }
            : {
                id: nextId++,
                title: 'Dernier tour !',
                subtitle: `${nameOf(event.playerId)} a tout retourné — un seul coup, puis on compte`,
                tone: 'alert',
                hold: 3400,
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
        // Le poids d'une carte se fait entendre quand elle touche la table,
        // pas quand le serveur annonce qu'elle va la toucher.
        case 'placed':
          cue('place', FLIGHT_DURATION);
          break;
        case 'discarded':
          cue('discard', FLIGHT_DURATION);
          break;
        case 'flipped':
        case 'initialFlip':
          cue('flip');
          break;
        // Fin de manche : la table se retourne en entier et les scores
        // attendent (cf. `useScoreDelay`). Sans un mot ici, ce temps-là
        // ressemblerait à une application qui a décroché.
        case 'roundOver':
          freshHero = {
            id: nextId++,
            title: 'Manche terminée',
            subtitle: 'On retourne tout',
            tone: 'warn',
            hold: 2600,
          };
          break;
        case 'gameOver':
          cue(event.winnerId === view.you.id ? 'win' : 'lose');
          break;
        default:
          break;
      }
    }

    // Changement de tour. On peut avoir posé le téléphone : le son et la
    // vibration ne suffisent pas, il faut aussi que l'écran le dise en grand.
    if (
      !firstRender &&
      view.currentPlayerId !== lastCurrent.current &&
      view.currentPlayerId === view.you.id &&
      view.phase === 'playing'
    ) {
      cue('yourTurn');
      // Une fermeture de manche mérite mieux qu'un « à toi » : on ne l'écrase pas.
      freshHero ??= { id: nextId++, title: 'À toi', subtitle: undefined, tone: 'good' };
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
    const timer = setTimeout(() => setHero(null), hero.hold ?? (hero.subtitle ? 2000 : 1100));
    return () => clearTimeout(timer);
  }, [hero]);

  // Le titre de l'onglet : sur un autre onglet ou l'écran verrouillé, c'est le
  // seul endroit où l'on peut encore apprendre que c'est à soi.
  const myTurn = view.phase === 'playing' && view.currentPlayerId === view.you.id;
  useEffect(() => {
    document.title = myTurn ? '▶ À toi ! · Skouikjo' : 'Skouikjo';
    return () => {
      document.title = 'Skouikjo';
    };
  }, [myTurn]);

  return (
    // Tout ce que l'application a à dire tient dans une seule colonne, calée
    // sur l'en-tête. Elle n'y recouvre que « manche · objectif », qui ne bouge
    // pas — les deux grilles, elles, restent entièrement lisibles pendant
    // qu'une annonce explique ce qui vient de s'y passer.
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-1.5 px-4">
      {/* `popLayout` sort l'annonce précédente du flux pendant qu'elle s'efface.
          Sans lui, ses 340 ms de sortie occupaient encore la place et poussaient
          la suivante vers le bas : sur une série de coups rapides, l'annonce
          descendait jusqu'au milieu des grilles au lieu de rester où l'œil
          l'attend. */}
      <AnimatePresence mode="popLayout">
        {hero && (
          <motion.div
            key={hero.id}
            className="max-w-[17rem] rounded-2xl border px-4 py-2 text-center backdrop-blur-md"
            style={{
              borderColor: HERO_EDGE[hero.tone],
              background: 'rgb(11 7 22 / 0.85)',
              boxShadow: hero.tone === 'alert' ? '0 0 24px rgb(255 90 95 / 0.28)' : undefined,
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SETTLE}
          >
            <div
              className="text-[1.05rem] font-black leading-tight tracking-tight"
              style={{ color: HERO_INK[hero.tone] }}
            >
              {hero.title}
            </div>
            {hero.subtitle && (
              <div className="mt-0.5 text-[0.78rem] font-medium leading-tight text-ink-dim">
                {hero.subtitle}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={MOVE}
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
  );
}
