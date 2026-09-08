'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Identité locale du joueur.
 *
 * Pas de compte, pas de mot de passe : un identifiant aléatoire gardé dans le
 * navigateur suffit pour une partie à deux. C'est aussi ce qui permet de
 * recharger la page ou de verrouiller son téléphone sans perdre sa place.
 */

// Le jeu s'appelle Skouikjo depuis, mais pas cette clé : la renommer
// effacerait le prénom et la bestiole de tous ceux qui ont déjà joué.
const KEY = 'skyskouiki.identity.v1';

export interface Identity {
  playerId: string;
  name: string;
  emoji: string;
}

export const EMOJIS = [
  '🦊', '🐙', '🐸', '🐼', '🦉', '🐝', '🦁', '🐧',
  '🦄', '🐢', '🦋', '🐨', '🦖', '🐳', '🌻', '🍄',
];

function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function read(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (!parsed.playerId) return null;
    return {
      playerId: parsed.playerId,
      name: parsed.name ?? '',
      emoji: parsed.emoji || randomEmoji(),
    };
  } catch {
    return null;
  }
}

function write(identity: Identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // Navigation privée ou stockage plein : on continue en mémoire.
  }
}

export function useIdentity() {
  // `null` tant qu'on n'a pas lu le stockage : évite un rendu serveur divergent.
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const existing = read();
    if (existing) {
      // Lecture d'un système externe (localStorage) : indisponible au rendu serveur.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdentity(existing);
      return;
    }
    const fresh: Identity = { playerId: crypto.randomUUID(), name: '', emoji: randomEmoji() };
    write(fresh);
    setIdentity(fresh);
  }, []);

  const update = useCallback((patch: Partial<Omit<Identity, 'playerId'>>) => {
    setIdentity((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      write(next);
      return next;
    });
  }, []);

  return { identity, update, ready: identity !== null };
}
