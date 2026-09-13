'use client';

/**
 * Le rappel « c'est à toi », quand l'écran n'est plus regardé.
 *
 * À deux joueurs, on agit un tour sur deux et on ne pose pas le téléphone. À
 * quatre, on joue un tour sur quatre : les trois quarts d'une partie se passent
 * à regarder, et au bout d'une manche les gens posent l'appareil, changent
 * d'onglet, parlent à la personne d'en face. Le jeu n'avait alors que le son,
 * la vibration et le titre de l'onglet pour les rappeler — trois signaux qui
 * s'adressent tous à quelqu'un qui regarde déjà.
 *
 * Trois principes, et le premier est le plus important :
 *
 * 1. **Rien ne se demande sans qu'on le demande.** La permission n'est réclamée
 *    qu'au moment où le joueur active le réglage lui-même. Une application qui
 *    ouvre la boîte de dialogue à l'arrivée se fait refuser une fois pour
 *    toutes, et le refus est définitif dans certains navigateurs.
 * 2. **Rien ne s'affiche quand l'écran est là.** Le liseré, le son et
 *    l'annonce font déjà le travail ; une bannière système par-dessus la table
 *    serait du bruit. On ne notifie que si la page est cachée.
 * 3. **Une seule à la fois.** Un `tag` fixe : la notification du tour précédent
 *    est remplacée, pas empilée.
 *
 * Ses limites sont réelles et il vaut mieux les dire : sur iPhone, l'API
 * n'existe que si la page a été ajoutée à l'écran d'accueil, et un téléphone
 * verrouillé peut geler l'onglet avant même que le coup n'arrive. C'est un
 * rappel de plus, pas une notification poussée depuis un serveur.
 */

const KEY = 'skyskouiki.nudge.v1';

export type NudgeState =
  /** Le navigateur ne sait pas faire (Safari iOS hors écran d'accueil). */
  | 'unsupported'
  /** Possible, pas demandé. */
  | 'off'
  /** Demandé et accordé. */
  | 'on'
  /** Refusé par le navigateur : le réglage ne peut plus rien. */
  | 'denied';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function wanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function nudgeState(): NudgeState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return wanted() && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Demande la permission, et retient le choix. Rend l'état qui en résulte. */
export async function enableNudge(): Promise<NudgeState> {
  if (!supported()) return 'unsupported';
  try {
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
    localStorage.setItem(KEY, '1');
    return 'on';
  } catch {
    return 'off';
  }
}

export function disableNudge() {
  try {
    localStorage.setItem(KEY, '0');
  } catch {
    // Navigation privée : le réglage ne survivra pas, tant pis.
  }
}

/**
 * Prévient que c'est à ce joueur — seulement s'il ne regarde pas.
 *
 * Silencieuse en cas d'échec : une notification qui ne part pas n'est pas une
 * erreur de jeu, et il n'y a rien à en dire à quelqu'un qui, par définition,
 * n'est pas devant l'écran.
 */
export function nudgeTurn(body: string) {
  if (nudgeState() !== 'on') return;
  if (typeof document === 'undefined' || !document.hidden) return;
  try {
    const note = new Notification('À toi de jouer !', {
      body,
      tag: 'skouikjo-turn',
      renotify: true,
      icon: '/icon',
      badge: '/icon',
    } as NotificationOptions & { renotify: boolean });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Certains navigateurs exigent un service worker pour notifier depuis une
    // page. Rien à faire de plus ici : le son et le titre restent.
  }
}
