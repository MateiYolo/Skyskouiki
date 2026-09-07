'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useState } from 'react';
import { PlayingCard } from '@/components/PlayingCard';
import { EMOJIS, useIdentity } from '@/lib/client/identity';
import { cue, initAudio } from '@/lib/client/feedback';

/** Petit éventail de cartes : donne le ton avant même d'avoir lu un mot. */
function Fan() {
  const cards = [-2, 0, 4, 8, 12];
  return (
    <div className="mb-6 flex justify-center" aria-hidden>
      {cards.map((value, i) => (
        <motion.div
          key={value}
          className="w-14"
          style={{ marginLeft: i === 0 ? 0 : '-0.75rem', zIndex: i }}
          initial={{ y: 40, opacity: 0, rotate: 0 }}
          animate={{ y: 0, opacity: 1, rotate: (i - 2) * 8 }}
          transition={{ delay: 0.06 * i, type: 'spring', stiffness: 220, damping: 18 }}
        >
          <PlayingCard value={value} faceUp size="md" />
        </motion.div>
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { identity, update, ready } = useIdentity();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'menu' | 'join'>('menu');

  const displayName = identity?.name ?? '';
  const displayEmoji = emoji || identity?.emoji || '🦊';
  const pendingName = name || displayName;

  const saveProfile = () => {
    const trimmed = pendingName.trim();
    if (!trimmed) return null;
    update({ name: trimmed, emoji: displayEmoji });
    return trimmed;
  };

  const createGame = async () => {
    initAudio();
    cue('tap');
    const finalName = saveProfile();
    if (!finalName || !identity) {
      setError('Il me faut un prénom.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: identity.playerId, name: finalName, emoji: displayEmoji }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Création impossible.');
      router.push(`/r/${body.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
      setBusy(false);
    }
  };

  const joinGame = () => {
    initAudio();
    cue('tap');
    const finalName = saveProfile();
    const cleaned = code.trim().toUpperCase();
    if (!finalName) return setError('Il me faut un prénom.');
    if (cleaned.length < 4) return setError('Le code fait 4 caractères.');
    router.push(`/r/${cleaned}`);
  };

  if (!ready) return <div className="grid h-dvh place-items-center text-ink-faint">…</div>;

  return (
    <main className="safe-bottom safe-top mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <div className="rise">
        <Fan />

        <h1 className="text-center text-4xl font-black tracking-tight">Skyskouiki</h1>
        <p className="mb-7 mt-2 text-center text-sm text-ink-dim">
          Le Skyjo, chacun sur son téléphone. Règles officielles, une règle maison, zéro pub.
        </p>

        {/* Profil */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg transition ${
                  e === displayEmoji ? 'bg-accent/25 ring-2 ring-accent' : 'bg-white/5'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            value={pendingName}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ton prénom"
            maxLength={16}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-center font-semibold outline-none placeholder:text-ink-faint focus:border-accent/60"
          />
        </div>

        {mode === 'menu' ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={createGame}
              disabled={busy}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-base font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Création…' : 'Créer une partie'}
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className="w-full rounded-2xl border border-white/15 bg-white/6 px-4 py-4 text-base font-semibold transition active:scale-[0.98]"
            >
              Rejoindre avec un code
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={4}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-4 text-center font-mono text-3xl font-black tracking-[0.3em] outline-none placeholder:text-ink-faint focus:border-accent/60"
            />
            <button
              type="button"
              onClick={joinGame}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-base font-bold text-felt-900 transition active:scale-[0.98]"
            >
              Rejoindre
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="w-full py-2 text-sm text-ink-faint"
            >
              Retour
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}

        <p className="mt-6 text-center text-xs text-ink-faint">
          <Link href="/regles" className="underline underline-offset-4">
            Les règles complètes
          </Link>
        </p>
      </div>
    </main>
  );
}
