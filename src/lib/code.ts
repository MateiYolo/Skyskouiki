/**
 * Le code d'une partie, côté client comme côté serveur.
 *
 * Il ne contient que des chiffres : on le dicte à voix haute sans épeler, et le
 * clavier qui s'ouvre en face est un pavé numérique — pas un clavier complet où
 * il faut viser des lettres et se demander si c'est un O ou un zéro.
 */

export const CODE_LENGTH = 4;

/** Ne garde que les chiffres, et pas plus que la longueur d'un code. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH);
}
