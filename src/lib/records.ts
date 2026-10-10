/**
 * Le tableau des records, comme sur les flippers.
 *
 * Trois lettres, un score, et rien d'autre : pas de compte, pas de pseudo
 * vérifié, pas de modération. Celui qui écrit « CUL » au sommet du tableau
 * aura au moins mérité d'y être.
 *
 * Au Skyjo le meilleur score est le plus *petit* — un flipper à l'envers. Le
 * tableau en a donc deux, comme une borne qui alternerait ses écrans :
 *
 *   - **les meilleurs** : les totaux de fin de partie les plus bas, parmi ceux
 *     qui n'ont pas franchi la barre ;
 *   - **la honte** : les plus hauts, parmi ceux qui l'ont franchie.
 *
 * La barre partage proprement les deux : à chaque partie quelqu'un la franchit
 * (c'est ce qui la termine), et celui qui la franchit ne peut pas prétendre au
 * tableau des meilleurs. Chaque joueur a donc droit à un tableau, jamais aux
 * deux — et une table vide ne montre pas les mêmes lignes à l'endroit et à
 * l'envers.
 *
 * Ce module est partagé : le serveur y lit les règles du classement, le client
 * y lit de quoi savoir, avant d'écrire, s'il a une chance d'entrer.
 */

/** Dix lignes par tableau : la hauteur d'un écran de borne. */
export const BOARD_SIZE = 10;

/** Trois lettres, comme il se doit. */
export const INITIALS_LENGTH = 3;

/** Ce qu'une molette d'initiales fait défiler. */
export const INITIALS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';

export type BoardKind = 'best' | 'shame';

export interface RecordEntry {
  id: string;
  initials: string;
  score: number;
  /** Nombre de manches jouées : un 40 en deux manches n'est pas un 40 en sept. */
  rounds: number;
  players: number;
  spicy: boolean;
  /** Date d'inscription, en millisecondes. */
  at: number;
}

export interface HallOfFame {
  best: RecordEntry[];
  shame: RecordEntry[];
}

/** Le tableau qui revient à un total de fin de partie. */
export function boardFor(score: number, target: number): BoardKind {
  return score >= target ? 'shame' : 'best';
}

/**
 * Trie un tableau. À score égal, l'ancien reste devant : sur une borne, égaler
 * un record ne suffit pas à le prendre.
 */
export function rankBoard<T extends RecordEntry>(kind: BoardKind, entries: T[]): T[] {
  const sign = kind === 'best' ? 1 : -1;
  return [...entries]
    .sort((a, b) => sign * (a.score - b.score) || a.at - b.at)
    .slice(0, BOARD_SIZE);
}

/**
 * La place qu'un score prendrait, de 0 à `BOARD_SIZE - 1`, ou `null` s'il
 * n'entre pas.
 *
 * Même règle d'égalité que `rankBoard` : le nouveau venu se range *après* ceux
 * qui ont déjà fait aussi bien.
 */
export function placeFor(kind: BoardKind, entries: RecordEntry[], score: number): number | null {
  const ahead = entries.filter((e) => (kind === 'best' ? e.score <= score : e.score >= score)).length;
  return ahead < BOARD_SIZE ? ahead : null;
}

/**
 * Les initiales qu'on propose d'office : le début du prénom, accents ôtés.
 *
 * Un « Éloïse » devient « ELO ». Ce qui ne passe pas dans l'alphabet de la
 * molette saute, et ce qui manque se complète de points — on corrige à la
 * molette, pas au clavier.
 */
export function suggestInitials(name: string): string {
  const letters = name
    .normalize('NFD')
    .toUpperCase()
    .split('')
    .filter((c) => INITIALS_ALPHABET.includes(c) && c !== '.' && c !== '-')
    .join('')
    .slice(0, INITIALS_LENGTH);
  return letters.padEnd(INITIALS_LENGTH, '.');
}

/** « 1ER », « 2E »… : le rang comme l'écrit une borne, en français. */
export function rankLabel(rank: number): string {
  return rank === 0 ? '1ER' : `${rank + 1}E`;
}
