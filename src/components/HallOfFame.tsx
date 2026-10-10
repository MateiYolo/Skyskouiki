'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cue } from '@/lib/client/feedback';
import {
  BOARD_SIZE,
  INITIALS_ALPHABET,
  INITIALS_LENGTH,
  boardFor,
  placeFor,
  rankLabel,
  suggestInitials,
  type BoardKind,
  type HallOfFame,
  type RecordEntry,
} from '@/lib/records';
import type { GameView } from '@/lib/skyjo';

/**
 * Le tableau des records, habillé en borne d'arcade.
 *
 * Tout le reste du jeu parle la langue d'une table de cartes le soir : du
 * feutre, des courbes douces, des cartes qui glissent. Ici, on change d'objet
 * — c'est l'écran du flipper au fond du bar. Police pixel, phosphore qui bave,
 * lignes de balayage, et rien qui glisse : tout apparaît d'un coup, ligne
 * après ligne, comme un écran qu'on rafraîchit.
 */

/** Une couleur par rang, comme sur les bornes qui faisaient défiler l'arc-en-ciel. */
const BEST_INKS = ['#ffcc4d', '#ff8a3d', '#ff5a5f', '#e94ec0', '#b77cff', '#38bdf8', '#2fe0c2', '#4ade80', '#d4f04c', '#f4f0ff'];
/** La honte, elle, se décline en rouges qui chauffent. */
const SHAME_INKS = ['#ff3b3b', '#ff5a5f', '#ff6f61', '#ff8a5c', '#ff9f5a', '#ffb35c', '#ffc66b', '#ffd27f', '#ffdd99', '#ffe8b8'];

const TITLES: Record<BoardKind, string> = {
  best: 'MEILLEURS SCORES',
  shame: 'MUR DE LA HONTE',
};

/** Les dix lignes d'un tableau, trous compris : une borne affiche toujours ses dix rangs. */
export function Scoreboard({
  kind,
  entries,
  highlight,
  compact = false,
}: {
  kind: BoardKind;
  entries: RecordEntry[];
  /** L'identifiant de la ligne qui clignote : celle qu'on vient de graver. */
  highlight?: string | null;
  compact?: boolean;
}) {
  const inks = kind === 'best' ? BEST_INKS : SHAME_INKS;
  const rows = Array.from({ length: BOARD_SIZE }, (_, i) => entries[i] ?? null);

  return (
    <div className="font-arcade select-none">
      <h3
        className={`arcade-glow mb-3 text-center ${compact ? 'text-[0.6rem]' : 'text-xs sm:text-sm'}`}
        style={{ color: kind === 'best' ? '#ffcc4d' : '#ff5a5f' }}
      >
        {kind === 'best' ? '★ ' : '☠ '}
        {TITLES[kind]}
        {kind === 'best' ? ' ★' : ' ☠'}
      </h3>
      <ol className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
        {rows.map((entry, rank) => (
          <motion.li
            key={entry?.id ?? `vide-${rank}`}
            // Pas de fondu : une ligne de borne est là ou n'y est pas.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0, delay: 0.07 * rank }}
            className={[
              'arcade-glow grid grid-cols-[3.2em_1fr_auto_1.6em] items-baseline gap-2',
              compact ? 'text-[0.55rem]' : 'text-[0.7rem] sm:text-xs',
              entry && entry.id === highlight ? 'arcade-blink' : '',
            ].join(' ')}
            style={{ color: entry ? inks[rank] : '#6c6090' }}
          >
            <span>{rankLabel(rank)}</span>
            <span className="tracking-[0.25em]">{entry ? entry.initials : '---'}</span>
            <span className="text-right tabular-nums">{entry ? entry.score : '...'}</span>
            {/* Les -5 du mode spicy rendent les scores incomparables : le
                piment le dit, sans faire un troisième tableau. */}
            <span className="text-center font-sans text-[0.8rem] [text-shadow:none]" aria-label={entry?.spicy ? 'mode spicy' : undefined}>
              {entry?.spicy ? '🌶' : ''}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Un bouton qu'on peut tenir : la molette défile toute seule tant qu'on appuie.
 * Trente-huit caractères à la molette, c'est long — sur une borne aussi, on
 * gardait le joystick enfoncé.
 */
function HoldButton({ onStep, label, children }: { onStep: () => void; label: string; children: React.ReactNode }) {
  const timers = useRef<{ wait?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});

  const stop = useCallback(() => {
    clearTimeout(timers.current.wait);
    clearInterval(timers.current.repeat);
  }, []);
  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        stop();
        // La molette ne dépend que de sa case et de son sens : la fonction
        // saisie à l'appui reste bonne tant qu'on tient.
        onStep();
        timers.current.wait = setTimeout(() => {
          timers.current.repeat = setInterval(onStep, 85);
        }, 340);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => event.preventDefault()}
      className="grid h-9 w-full place-items-center rounded-lg text-ink-dim active:bg-white/10 active:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * Trois molettes de lettres, à l'ancienne.
 *
 * ▲ ▼ font défiler, on tape une case pour la choisir. Au clavier : les
 * flèches, ou taper directement les lettres, Entrée pour graver.
 */
export function InitialsEntry({
  initial,
  onSubmit,
  busy,
}: {
  initial: string;
  onSubmit: (initials: string) => void;
  busy: boolean;
}) {
  const [letters, setLetters] = useState(() => Array.from(initial.slice(0, INITIALS_LENGTH)));
  const [slot, setSlot] = useState(0);

  const spin = (at: number, by: number) => {
    cue('blip');
    setSlot(at);
    setLetters((current) => {
      const next = [...current];
      const index = INITIALS_ALPHABET.indexOf(next[at]);
      const n = INITIALS_ALPHABET.length;
      next[at] = INITIALS_ALPHABET[(((index === -1 ? 0 : index) + by) % n + n) % n];
      return next;
    });
  };

  const submit = () => {
    if (!busy) onSubmit(letters.join(''));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (event.key === 'ArrowUp') spin(slot, 1);
      else if (event.key === 'ArrowDown') spin(slot, -1);
      else if (event.key === 'ArrowLeft' || event.key === 'Backspace') setSlot((s) => Math.max(0, s - 1));
      else if (event.key === 'ArrowRight') setSlot((s) => Math.min(INITIALS_LENGTH - 1, s + 1));
      else if (event.key === 'Enter') submit();
      else if (key.length === 1 && INITIALS_ALPHABET.includes(key)) {
        cue('blip');
        setLetters((current) => current.map((c, i) => (i === slot ? key : c)));
        setSlot((s) => Math.min(INITIALS_LENGTH - 1, s + 1));
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="font-arcade">
      <div className="mx-auto flex w-fit gap-3">
        {letters.map((letter, i) => (
          <div key={i} className="flex w-14 flex-col items-center">
            <HoldButton label="Lettre suivante" onStep={() => spin(i, 1)}>
              ▲
            </HoldButton>
            <button
              type="button"
              onClick={() => setSlot(i)}
              className={[
                'arcade-glow grid h-14 w-14 place-items-center rounded-lg border-b-4 text-2xl',
                i === slot ? 'border-accent text-accent' : 'border-white/15 text-ink',
              ].join(' ')}
            >
              <span className={i === slot ? 'arcade-blink' : ''}>{letter}</span>
            </button>
            <HoldButton label="Lettre précédente" onStep={() => spin(i, -1)}>
              ▼
            </HoldButton>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mx-auto mt-3 block rounded-xl border-2 border-accent px-5 py-2.5 text-[0.7rem] text-accent transition active:scale-95 disabled:opacity-40"
      >
        {busy ? '...' : 'GRAVER'}
      </button>
    </div>
  );
}

/** Le tableau, une fois chargé. `null` tant qu'on attend, et si la borne est en panne. */
export function useHallOfFame() {
  const [fame, setFame] = useState<HallOfFame | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/records', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: HallOfFame | null) => alive && body && setFame(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return [fame, setFame] as const;
}

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * L'encart des records sur l'écran de fin de partie.
 *
 * Trois issues, selon ce que le tableau dit de mon score : j'entre, et la borne
 * me demande mes initiales ; j'ai déjà gravé, et elle me montre ma ligne qui
 * clignote ; je n'entre pas, et elle me dit ce qu'il fallait faire.
 *
 * Chaque téléphone s'occupe de son joueur : le perdant de la soirée peut
 * graver sa honte pendant que le gagnant grave sa gloire.
 */
export function FameCorner({ view }: { view: GameView }) {
  const me = view.players.find((p) => p.id === view.you.id);
  const [fame, setFame] = useHallOfFame();
  // La partie terminée se reconnaît à son salon, son nombre de manches et mon
  // score — comme côté serveur, et pour la même raison : la version bouge.
  const storeKey = `skouikjo.record.${view.id}.${view.round}.${me?.totalScore}`;
  const [mine, setMine] = useState<string | null>(() => readStored(storeKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (!me || !fame) return null;

  const kind = boardFor(me.totalScore, view.targetScore);
  const place = placeFor(kind, fame[kind], me.totalScore);

  const engrave = async (initials: string) => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/games/${view.code}/record`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: view.you.id, initials }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { id: string; fame: HallOfFame };
      try {
        sessionStorage.setItem(storeKey, body.id);
      } catch {
        // tant pis : au pire, on redemandera les initiales
      }
      cue('record');
      setFame(body.fame);
      setMine(body.id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  let content: React.ReactNode;
  if (mine) {
    content = <Scoreboard kind={kind} entries={fame[kind]} highlight={mine} compact />;
  } else if (place !== null) {
    content = (
      <>
        <p
          className="font-arcade arcade-glow arcade-blink mb-1 text-center text-[0.7rem]"
          style={{ color: kind === 'best' ? '#ffcc4d' : '#ff5a5f' }}
        >
          {kind === 'best' ? 'NOUVEAU RECORD !' : 'MUR DE LA HONTE !'}
        </p>
        <p className="mb-3 text-center text-xs text-ink-dim">
          {kind === 'best'
            ? `${place === 0 ? 'Meilleur score de tous les temps.' : `${rankLabel(place).toLowerCase()} de tous les temps.`} Tes initiales :`
            : `${place === 0 ? 'Le pire score jamais vu.' : `${rankLabel(place).toLowerCase()} pire score jamais vu.`} Assume :`}
        </p>
        <InitialsEntry initial={suggestInitials(me.name)} onSubmit={engrave} busy={busy} />
        {error && <p className="mt-2 text-center text-xs text-danger">La borne est en panne. Réessaie.</p>}
      </>
    );
  } else {
    const top = fame[kind][0];
    content = top ? (
      <p className="font-arcade text-center text-[0.55rem] leading-relaxed text-ink-faint">
        {kind === 'best' ? 'RECORD A BATTRE' : 'PIRE SCORE'} : {top.initials} {top.score}
      </p>
    ) : null;
  }

  if (!content) return null;
  return (
    <motion.div
      className="scanlines relative mt-4 rounded-2xl border border-white/10 bg-black/40 px-3 py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0, delay: 0.6 }}
    >
      {content}
    </motion.div>
  );
}

type AttractPage = 'title' | BoardKind;
const ATTRACT_PAGES: AttractPage[] = ['title', 'best', 'shame'];
const ATTRACT_PAGE_MS = 5500;

/**
 * Le mode démo d'une borne : laissée seule, elle fait défiler son titre et ses
 * records en attendant qu'on la touche.
 *
 * C'est là que le tableau vit le reste du temps : l'accueil, laissé à lui-même
 * quelques secondes, se met à faire l'article. Un toucher n'importe où, et on
 * revient au menu — sur `click` et non `pointerdown`, pour que le doigt qui
 * réveille la borne n'appuie pas en plus sur le bouton d'en dessous.
 */
export function Attract({ onExit }: { onExit: () => void }) {
  const [fame] = useHallOfFame();
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setPage((p) => (p + 1) % ATTRACT_PAGES.length), ATTRACT_PAGE_MS);
    const onKey = () => onExit();
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onExit]);

  const current = ATTRACT_PAGES[page];

  return (
    <motion.div
      role="button"
      tabIndex={-1}
      aria-label="Revenir au menu"
      onClick={onExit}
      className={`font-arcade scanlines fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-felt-900 px-6`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="safe-top safe-bottom flex w-full max-w-sm flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
          >
            {current === 'title' ? (
              <div className="text-center">
                <p className="arcade-glow text-2xl leading-relaxed text-accent sm:text-3xl">SKOUIKJO</p>
                <p className="arcade-glow mt-6 text-[0.6rem] leading-loose text-swap">
                  LE SKYJO SUR TELEPHONE
                  <br />
                  2 A 8 JOUEURS
                </p>
                {fame?.best[0] && (
                  <p className="arcade-glow mt-10 text-[0.6rem] leading-loose text-steal">
                    RECORD : {fame.best[0].initials} {fame.best[0].score}
                  </p>
                )}
              </div>
            ) : (
              <Scoreboard kind={current} entries={fame?.[current] ?? []} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="arcade-glow arcade-blink pb-10 text-[0.65rem] text-ink">TOUCHE POUR JOUER</p>
    </motion.div>
  );
}

/**
 * Déclenche le mode démo après un moment sans rien toucher.
 *
 * Tout geste remet le compte à zéro, et un champ qui a le focus le suspend :
 * quelqu'un qui cherche son prénom au clavier n'est pas parti.
 */
export function useIdle(ms: number, enabled: boolean) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) arm();
        else setIdle(true);
      }, ms);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [ms, enabled]);

  return [idle && enabled, setIdle] as const;
}
