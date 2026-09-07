'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameView } from '@/lib/skyjo';

/** Action sans son `playerId` : la route le réinjecte à partir de l'identité. */
export type ClientAction =
  | Omit<Extract<Action, { type: 'join' }>, 'playerId'>
  | { type: Exclude<Action['type'], 'join' | 'flipInitial' | 'placeCard' | 'flipCard'> }
  | { type: 'flipInitial' | 'placeCard' | 'flipCard'; index: number };

let browserClient: SupabaseClient | null | undefined;

/** Client Supabase du navigateur : uniquement pour écouter, jamais pour écrire. */
function supabase(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  browserClient =
    url && key
      ? createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 10 } } })
      : null;
  return browserClient;
}

interface State {
  view: GameView | null;
  loading: boolean;
  error: string | null;
}

/**
 * Source de vérité côté client.
 *
 * Le navigateur ne lit jamais la partie dans la base : il apprend seulement
 * qu'elle a bougé (temps réel sur la méta publique), puis redemande au serveur
 * sa propre vue expurgée. Un sondage lent sert de filet si le temps réel tombe.
 */
export function useGame(code: string, playerId: string | null) {
  const [{ view, loading, error }, setState] = useState<State>({
    view: null,
    loading: true,
    error: null,
  });
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!playerId || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/games/${code}?playerId=${encodeURIComponent(playerId)}`, {
        cache: 'no-store',
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ view: null, loading: false, error: body.error ?? 'Partie introuvable.' });
        return;
      }
      setState({ view: body as GameView, loading: false, error: null });
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'Connexion perdue.' }));
    } finally {
      inFlight.current = false;
    }
  }, [code, playerId]);

  /** Envoie une action. L'erreur renvoyée est une règle du jeu, pas un bug. */
  const act = useCallback(
    async (action: ClientAction): Promise<string | null> => {
      if (!playerId) return 'Joueur non identifié.';
      setBusy(true);
      try {
        const res = await fetch(`/api/games/${code}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ playerId, action }),
        });
        const body = await res.json();
        if (!res.ok) {
          void refresh();
          return body.error ?? 'Action refusée.';
        }
        setState({ view: body as GameView, loading: false, error: null });
        return null;
      } catch {
        return 'Connexion perdue.';
      } finally {
        setBusy(false);
      }
    },
    [code, playerId, refresh],
  );

  useEffect(() => {
    // Première synchronisation avec le serveur : c'est bien un effet de bord.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Temps réel : on n'écoute que le compteur de version, jamais l'état.
  useEffect(() => {
    const client = supabase();
    if (!client || !playerId) return;

    const channel = client
      .channel(`skyjo:${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'skyjo', table: 'games', filter: `code=eq.${code}` },
        () => void refresh(),
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      void client.removeChannel(channel);
    };
  }, [code, playerId, refresh]);

  // Filet : sondage lent, et remise à jour dès qu'on revient sur l'onglet.
  useEffect(() => {
    if (!playerId) return;
    const period = live ? 15000 : 2500;
    const timer = setInterval(() => void refresh(), period);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [live, playerId, refresh]);

  const me = useMemo(
    () => view?.players.find((p) => p.id === playerId) ?? null,
    [view, playerId],
  );

  return { view, me, loading, error, busy, live, act, refresh };
}
