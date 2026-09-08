'use client';

/**
 * Retours haptiques et sonores.
 *
 * Les sons sont synthétisés à la volée (pas de fichier à charger) : quelques
 * oscillateurs suffisent à donner du poids aux gestes. Tout est coupable, et
 * l'AudioContext n'est créé qu'au premier geste de l'utilisateur — sinon les
 * navigateurs mobiles le bloquent.
 */

export type Cue =
  | 'tap'
  | 'flip'
  | 'draw'
  | 'place'
  | 'discard'
  | 'clear'
  | 'yourTurn'
  | 'lastTurn'
  | 'win'
  | 'lose';

// Nom d'avant le renommage : la garder, c'est garder le réglage de chacun.
const MUTE_KEY = 'skyskouiki.muted.v1';

let ctx: AudioContext | null = null;
let muted = false;

export function initAudio() {
  if (typeof window === 'undefined') return;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  void ctx?.resume();
}

/**
 * Prépare le son au tout premier contact avec la page.
 *
 * Un `AudioContext` coûte quelques dizaines de millisecondes à construire, et
 * les navigateurs mobiles refusent de le créer hors d'un geste utilisateur. Le
 * faire au premier tap sur une carte, c'était faire payer ce prix à la carte —
 * elle attendait le son avant de se retourner. On l'arme donc sur le premier
 * geste venu, quel qu'il soit, et les coups n'en entendent plus parler.
 */
export function armAudio() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', () => initAudio(), { once: true, capture: true });
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // tant pis
  }
}

/** Une note courte, enveloppe percussive. */
function note(freq: number, at: number, duration: number, gain = 0.14, type: OscillatorType = 'triangle') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Souffle bref : le bruit d'une carte qu'on fait glisser. */
function swoosh(at: number, duration = 0.16, gain = 0.05) {
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.exponentialRampToValueAtTime(2600, at + duration);
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(ctx.destination);
  src.start(at);
}

const HAPTICS: Record<Cue, number | number[]> = {
  tap: 8,
  flip: 12,
  draw: 10,
  place: 16,
  discard: 10,
  clear: [0, 30, 40, 60],
  yourTurn: [0, 18, 90, 18],
  lastTurn: [0, 24, 60, 24, 60, 24],
  win: [0, 40, 60, 40, 60, 120],
  lose: [0, 90],
};

/** Joue un retour sonore + haptique. Silencieux si l'audio n'a pas été initialisé. */
export function cue(kind: Cue) {
  try {
    navigator.vibrate?.(HAPTICS[kind]);
  } catch {
    // vibration non supportée
  }

  if (muted || !ctx) return;
  const t = ctx.currentTime;

  switch (kind) {
    case 'tap':
      note(520, t, 0.06, 0.07, 'sine');
      break;
    case 'flip':
      note(680, t, 0.07, 0.1);
      note(1020, t + 0.03, 0.08, 0.06);
      break;
    case 'draw':
      swoosh(t);
      note(420, t, 0.09, 0.06, 'sine');
      break;
    case 'place':
      note(300, t, 0.1, 0.13, 'square');
      note(600, t + 0.02, 0.12, 0.05);
      break;
    case 'discard':
      swoosh(t, 0.12, 0.045);
      note(240, t + 0.02, 0.1, 0.08, 'sine');
      break;
    case 'clear':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.065, 0.28, 0.12));
      break;
    case 'yourTurn':
      note(659.25, t, 0.12, 0.09, 'sine');
      note(880, t + 0.1, 0.16, 0.09, 'sine');
      break;
    case 'lastTurn':
      [880, 740, 880].forEach((f, i) => note(f, t + i * 0.11, 0.16, 0.11, 'sawtooth'));
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        note(f, t + i * 0.09, 0.45, 0.13),
      );
      break;
    case 'lose':
      [392, 349.23, 293.66].forEach((f, i) => note(f, t + i * 0.13, 0.34, 0.1, 'sine'));
      break;
  }
}
