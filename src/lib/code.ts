/**
 * Le code d'une partie, côté client comme côté serveur.
 *
 * Il ne contient que des chiffres : on le dicte à voix haute sans épeler, et le
 * clavier qui s'ouvre en face est un pavé numérique — pas un clavier complet où
 * il faut viser des lettres et se demander si c'est un O ou un zéro.
 */

/**
 * Trois chiffres, pas quatre.
 *
 * Un code de partie ne protège rien : il sert à retrouver la table de l'autre,
 * qui est dans la même pièce ou au bout du fil. Mille codes suffisent
 * largement à ce qu'aucune partie vivante n'en croise une autre, et trois
 * chiffres se dictent d'un souffle et se tapent sans regarder.
 */
export const CODE_LENGTH = 3;

/** Ne garde que les chiffres, et pas plus que la longueur d'un code. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH);
}
