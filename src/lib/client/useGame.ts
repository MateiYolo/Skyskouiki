'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '@/lib/skyjo';
import { flightsForAction, requestFlights } from './flights';
import { optimisticView, revealingIndex } from './optimistic';
import type { ClientAction } from './actions';

export type { ClientAction };

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
  // Un rafraîchissement demandé pendant qu'un autre est en vol ne doit pas être
  // jeté : sinon la version que porte cette notification n'arrive jamais, et le
  // coup de l'adversaire — une colonne éliminée, une carte piochée — se joue
  // dans le dos de l'autre écran.
  const refreshAgain = useRef(false);
  // Dernière version reçue : le serveur s'en sert pour rejouer ce qu'on a raté.
  const lastVersion = useRef(0);
  // Cases en train de se retourner sous le doigt, en attendant leur valeur.
  const [revealing, setRevealing] = useState<readonly number[]>([]);
  // Un rafraîchissement parti avant l'action ne doit pas revenir écraser la
  // vue optimiste par l'état d'avant : on ignore ce qui date d'avant l'envoi.
  const pending = useRef(0);
  // Les coups partent en file : le joueur peut enchaîner deux taps, le serveur
  // n'en verra jamais deux à la fois sur un état qui n'existe déjà plus.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async (): Promise<void> => {
    if (!playerId) return;
    // Occupé : on note qu'il faudra recommencer, et le tour en cours s'en charge.
    if (inFlight.current) {
      refreshAgain.current = true;
      return;
    }
    inFlight.current = true;
    try {
      // Tant qu'une notification est tombée pendant la requête, on refait un
      // tour : c'est la seule façon de ne pas laisser filer une version.
      do {
        refreshAgain.current = false;
        const since = lastVersion.current;
        const res = await fetch(
          `/api/games/${code}?playerId=${encodeURIComponent(playerId)}${since ? `&since=${since}` : ''}`,
          { cache: 'no-store' },
        );
        const body = await res.json();
        if (!res.ok) {
          setState({ view: null, loading: false, error: body.error ?? 'Partie introuvable.' });
          return;
        }
        // Une action est partie entre-temps : sa réponse fera foi, pas celle-ci.
        if (pending.current > 0) return;
        const view = body as GameView;
        lastVersion.current = view.version;
        setState({ view, loading: false, error: null });
      } while (refreshAgain.current);
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'Connexion perdue.' }));
    } finally {
      inFlight.current = false;
    }
  }, [code, playerId]);

  /**
   * Envoie une action, après l'avoir jouée localement.
   *
   * Le coup est appliqué à l'écran avant le premier octet réseau : c'est ce qui
   * fait la différence entre une carte qui répond au doigt et une carte qui
   * répond au ping. La réponse du serveur fait ensuite autorité — elle apporte
   * les valeurs cachées et corrige au besoin. L'erreur renvoyée est une règle
   * du jeu, pas un bug.
   */
  const act = useCallback(
    async (action: ClientAction): Promise<string | null> => {
      if (!playerId) return 'Joueur non identifié.';

      // L'affichage bouge maintenant. L'ordre compte : le vol se mesure sur la
      // mise en page d'avant le coup.
      if (view) requestFlights(flightsForAction(view, action, playerId));
      setState((s) => {
        const guess = s.view && optimisticView(s.view, action, playerId);
        return guess ? { ...s, view: guess } : s;
      });
      const turning = revealingIndex(action);
      if (turning !== null) setRevealing((r) => [...r, turning]);

      pending.current += 1;
      setBusy(true);

      // L'envoi, lui, attend son tour derrière le coup précédent.
      const send = async (): Promise<string | null> => {
        try {
          const res = await fetch(`/api/games/${code}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ playerId, action }),
          });
          const body = await res.json();
          pending.current -= 1;
          if (!res.ok) {
            // Le pari était mauvais : on reprend l'état réel avant d'expliquer.
            void refresh();
            return body.error ?? 'Action refusée.';
          }
          if (pending.current === 0) {
            const view = body as GameView;
            lastVersion.current = view.version;
            setState({ view, loading: false, error: null });
          }
          return null;
        } catch {
          pending.current -= 1;
          void refresh();
          return 'Connexion perdue.';
        } finally {
          if (turning !== null) setRevealing((r) => r.filter((i) => i !== turning));
          if (pending.current === 0) setBusy(false);
        }
      };

      /**
       * Deux retournements de début de manche ne dépendent pas l'un de l'autre :
       * les faire attendre leur tour, c'est faire payer au joueur deux
       * aller-retours au lieu d'un. Le serveur les traite sous verrou optimiste
       * et rejoue celui qui arrive sur une version périmée, donc il n'y a rien à
       * protéger ici. Tout le reste s'enchaîne — jeter puis retourner, poser
       * après avoir pioché : ces coups-là n'existent que dans l'ordre.
       */
      if (action.type === 'flipInitial') return send();

      const run = queue.current.then(send, send);
      queue.current = run;
      return run;
    },
    [code, playerId, refresh, view],
  );

  useEffect(() => {
    // Première synchronisation avec le serveur : c'est bien un effet de bord.
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

  return { view, me, loading, error, busy, live, revealing, act, refresh };
}
