/**
 * Le canal temps réel d'une partie, nommé au même endroit des deux côtés.
 *
 * Le serveur y publie la vue partagée après chaque coup ; les téléphones
 * l'écoutent. Un nom qui diverge d'un côté ne casse rien de visible — les
 * clients se rattrapent au sondage — mais on perd exactement ce que la
 * diffusion apportait. D'où une seule définition.
 */

export const gameChannel = (code: string) => `skyjo:${code}`;

/** L'événement qui porte la vue partagée. */
export const VIEW_EVENT = 'view';
