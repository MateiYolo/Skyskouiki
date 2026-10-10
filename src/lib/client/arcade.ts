/**
 * Un texte tel qu'une borne d'arcade sait l'écrire : en capitales, sans accent.
 *
 * La police pixel n'a pas de capitales accentuées — un « À » y retombe en
 * minuscule, au milieu d'un mot en capitales. Les bornes n'en avaient pas non
 * plus : on écrit « A TOI », comme elles.
 */
export function arcadeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}
