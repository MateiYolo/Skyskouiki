import type { GameView, RoundScore } from '@/lib/skyjo';

/**
 * Les piques de fin de manche.
 *
 * La feuille de scores dit déjà les chiffres — jauges, compteurs, ×2. Ce qu'il
 * lui manquait, c'est la voix : quelqu'un à table qui commente. Une phrase
 * neutre (« On compte les dégâts ») dit la même chose à celui qui finit à -3 et
 * à celui qui vient d'encaisser 42 ; autant ne rien dire.
 *
 * D'où deux règles ici :
 *
 * 1. **La situation d'abord.** Le ton se choisit sur ce qui vient réellement de
 *    se passer — fermeture ratée, score négatif, écart indécent, trois points
 *    d'écart. Une vanne qui tombe à côté du résultat est pire que pas de vanne.
 * 2. **Le pool est large.** Une partie, c'est cinq à dix manches, et deux
 *    joueurs qui lisent la même phrase deux fois arrêtent de la lire. Chaque
 *    situation a donc de quoi tenir une soirée.
 *
 * Le tirage est *déterministe* : il se calcule à partir de la version de la
 * partie, pas d'un `Math.random()`. La feuille de scores se redessine (une
 * jauge qui monte, un compteur qui tourne, un joueur qui se reconnecte), et une
 * phrase qui changeait à chaque rendu clignoterait sous les yeux. Même version,
 * même phrase — et la version change à chaque manche.
 */

/** La situation de fin de manche, telle que la vanne la voit. */
export type RoundMood =
  | 'doubled'
  | 'negative'
  | 'zero'
  | 'closed'
  | 'theyDoubled'
  | 'soloWin'
  | 'tightWin'
  | 'win'
  | 'crushed'
  | 'tightLoss'
  | 'loss'
  | 'heavy'
  | 'middle';

export type GameMood =
  | 'winBig'
  | 'winTight'
  | 'win'
  | 'loseBig'
  | 'loseTight'
  | 'lose';

/** De quelle couleur la phrase se lit : c'est le résultat qui décide, pas le texte. */
export type QuipTone = 'good' | 'warn' | 'bad';

export interface Quip {
  line: string;
  tone: QuipTone;
}

/** Au-delà, l'écart n'est plus une avance : c'est une autre partie. */
const BLOWOUT = 15;
/** Encaisser ça quand quelqu'un a fait mieux, c'est une manche perdue d'avance. */
const CRUSHED = 20;
/** En dessous, la manche s'est jouée sur un dos mal retourné. */
const TIGHT = 3;
/** Un total qui pèse, même sans être le pire de la table. */
const HEAVY = 25;

const ROUND_QUIPS: Record<RoundMood, readonly string[]> = {
  // Fermer sans avoir le plus petit total : la seule façon de se punir
  // soi-même. C'est la situation la plus drôle du jeu, elle mérite le plus
  // gros pool.
  doubled: [
    'Fermeture ratée, score doublé. Le grand classique.',
    'Tu as fermé la manche. La manche s’est refermée sur toi.',
    '×2. Le courage, c’est bien. Le calcul, c’est mieux.',
    'Tu voulais finir en beauté, tu finis en double.',
    'On compte avant de tout retourner. Pas après.',
    'Score doublé. Les autres n’en demandaient pas tant.',
    'Tu as tout retourné un peu vite, non ?',
    'Fermer avec un total pareil, il fallait oser.',
    '×2. Toute la table te remercie.',
    'Tu as sonné la fin de la manche. Elle t’a répondu deux fois.',
    'Ce n’est pas une punition, c’est une facture.',
    'Courageux. Pas malin, mais courageux.',
    'Il fallait attendre encore un tour. Juste un.',
    'Personne ne t’avait demandé de fermer. Personne.',
  ],
  // Finir sous zéro, ça ne s'excuse pas : ça se célèbre bruyamment.
  negative: [
    'Score négatif. Tu ne joues visiblement pas au même jeu.',
    'Un total sous zéro, c’est presque insultant.',
    'Tu finis dans les négatifs, l’air de rien.',
    'Moins que rien, et c’est un compliment.',
    // « manche » de chemise, « manche » de jeu : la table pense aux deux.
    'Négatif. Quelqu’un vérifie tes manches.',
    'Le seul score qu’on a envie de montrer à la table.',
    'Tu passes sous zéro pendant que les autres apprennent à compter.',
    'Un chiffre pareil, ça se raconte au repas de famille.',
    'Négatif : le reste de la table te déteste un peu, là.',
    'Ce score n’a pas le droit d’exister. Bien joué.',
  ],
  zero: [
    'Zéro pointé. Dans le bon sens, pour une fois.',
    'Zéro. Le vide absolu, et c’est magnifique.',
    'Rien encaissé. On ne fait pas mieux.',
    'Zéro pile. Chirurgical.',
    'Tu n’as rien pris. Les autres, si.',
    'Un zéro tout rond, à encadrer.',
    'Même le tableau n’a rien à ajouter.',
  ],
  // Fermer et finir devant : le coup que tout le monde vise et que personne ne
  // réussit.
  closed: [
    'Fermeture propre. Tu as coupé la musique au bon moment.',
    'Tu fermes, tu finis devant. Insupportable.',
    'Le timing était parfait. On te le dira une fois.',
    'Tu as fermé pile avant que ça tourne mal.',
    'Fermeture réussie : la table n’a pas eu le temps de respirer.',
    'Tu retournes ta dernière carte, tout le monde s’arrête. Pratique.',
    'La manche s’est arrêtée quand ça t’arrangeait. Étrange, non ?',
    'Fermer et gagner : le combo qui énerve.',
    'Tu as fermé au bon moment. Ça ne se reproduira pas.',
  ],
  // La fermeture ratée d'un autre : ce n'est pas mon résultat, mais c'est la
  // meilleure chose du tableau et elle mérite d'être relevée.
  theyDoubled: [
    'Quelqu’un a fermé trop tôt. On applaudit poliment.',
    'Il y a un score doublé dans ce tableau, et il n’est pas à toi.',
    '×2 en face. La manche valait le coup d’œil.',
    'Une fermeture ratée sur le tableau. Pas la tienne, c’est l’essentiel.',
    'Le ×2 est tombé, mais pas sur toi. Bonne soirée.',
    'Quelqu’un vient d’apprendre à quoi sert le ×2.',
  ],
  soloWin: [
    'Écart indécent. Tu as joué seul dans ton coin.',
    'Les autres jouaient à autre chose, visiblement.',
    'Tu es devant. Très loin devant. Fais semblant d’être surpris.',
    'Ce n’est plus une manche, c’est une démonstration.',
    'Un écart pareil, ça mérite un silence gêné.',
    'Tu as pris la tête et éteint la lumière en partant.',
    'En face, on a arrêté de compter.',
    'À ce niveau-là, on ne compte plus, on constate.',
    'Écart massif. Tu peux lever le pied, c’est gênant.',
  ],
  tightWin: [
    'Tu passes devant d’un cheveu. On ne dira rien.',
    'Gagné de peu, gagné quand même. C’est ce qu’on retient.',
    'Quelques points d’avance. Une carte de plus et c’était l’inverse.',
    'Serré. Tu as eu chaud, mais tu es devant.',
    'Photo-finish. Tu peux souffler.',
    'Une poignée de points entre toi et l’humiliation. Profite.',
    'Le genre de victoire qu’on ne raconte pas trop en détail.',
    'Devant d’un rien. Personne ne recompte, d’accord ?',
  ],
  win: [
    'Meilleur total de la manche. Ça se fête discrètement.',
    'Devant tout le monde. Pour l’instant.',
    'Bien joué. Le tableau te donne raison.',
    'Tu prends la manche. Reste à tenir la partie.',
    'Petit total, grosse satisfaction.',
    'Tu gères. Ne le dis pas trop fort.',
    'Manche à toi. On note.',
  ],
  crushed: [
    'Tu as ramassé toute la manche à toi seul. Merci.',
    'Écart cruel. Quelqu’un devait le faire.',
    'Tu as pris les points des autres en plus des tiens.',
    'C’est ce qu’on appelle une manche formatrice.',
    'Tu n’as pas perdu la manche, tu l’as offerte.',
    'Rien à sauver. On passe à la suivante, vite.',
    'Personne n’a eu à faire d’effort, en face.',
    'Ce total ne rentre pas dans une phrase polie.',
    'Tu as joué avec les yeux fermés ? C’est une vraie question.',
  ],
  tightLoss: [
    'Dernier à quelques points près. Ça, ça pique.',
    'Il s’en est fallu d’une carte.',
    'Perdu de rien du tout. C’est pire que perdu de loin.',
    'Tellement proche que ça mériterait une enquête.',
    'Un point de moins et tu y étais. Enfin, presque.',
    'Serré, et du mauvais côté du serré.',
    'À ce niveau d’écart, c’est juste de la malchance. Vraiment.',
  ],
  loss: [
    'Bon. On efface et on recommence.',
    'Dernier. Ça arrive aux meilleurs, paraît-il.',
    'Tu as encaissé. Le tableau s’en souviendra.',
    'Manche compliquée. On va dire ça comme ça.',
    'Tu as pris cher, mais tu es toujours là.',
    'La prochaine sera meilleure. Statistiquement.',
    'Dernier de la manche. Le titre est temporaire.',
  ],
  heavy: [
    'Gros total, mais pas le pire. Maigre consolation.',
    'Tu prends cher, et tu n’es même pas dernier.',
    'Ça monte vite quand on ne regarde pas.',
    'Un total pareil, ça se paie en fin de partie.',
    'Lourd. Très lourd. Mais pas le plus lourd.',
    'Tu as pioché à l’instinct, on dirait.',
  ],
  middle: [
    'Le ventre mou de la manche. Confortable, sans gloire.',
    'Ni héros ni victime. Le juste milieu, quoi.',
    'Tu es au milieu. On te voit à peine.',
    'Manche honnête. Personne n’en parlera.',
    'Pas de dégâts majeurs, pas d’exploit non plus.',
    'Tu surnages. C’est déjà ça.',
    'Le score de quelqu’un qui attend son heure.',
    'Rien à signaler. C’est presque suspect.',
  ],
};

const ROUND_TONES: Record<RoundMood, QuipTone> = {
  doubled: 'bad',
  negative: 'good',
  zero: 'good',
  closed: 'good',
  theyDoubled: 'good',
  soloWin: 'good',
  tightWin: 'good',
  win: 'good',
  crushed: 'bad',
  tightLoss: 'warn',
  loss: 'warn',
  heavy: 'warn',
  middle: 'warn',
};

const GAME_QUIPS: Record<GameMood, readonly string[]> = {
  winBig: [
    'Victoire écrasante. Tu peux arrêter, c’est gênant.',
    'Tu gagnes avec une marge insultante.',
    'Personne n’a jamais été dans la partie.',
    'Domination totale. La revanche est en dessous, si quelqu’un ose.',
  ],
  winTight: [
    'Victoire arrachée. Ne recompte pas, c’est bon.',
    'Tu gagnes d’un souffle. Le plus beau des vols.',
    'Ça s’est joué à rien du tout. Savoure vite.',
  ],
  win: [
    'Le plus petit score l’emporte. Tu as très bien su ne rien prendre.',
    'Partie pliée. Bien joué.',
    'Tu gagnes. Reste à le refaire.',
  ],
  loseBig: [
    'C’était long. La revanche est juste en dessous.',
    'Tu as tenu jusqu’au bout, c’est déjà quelque chose.',
    'Défaite large. On remet ça tout de suite ?',
  ],
  loseTight: [
    'Perdu de peu. La revanche est une formalité, non ?',
    'Quelques points. Juste quelques points. Revanche ?',
    'Si près. Le bouton en dessous existe exactement pour ça.',
  ],
  lose: [
    'La revanche est juste en dessous.',
    'Cette partie n’était pas pour toi. La prochaine, on verra.',
    'Perdu. Ça se répare en une partie.',
  ],
};

/**
 * La situation, lue dans les scores de la manche.
 *
 * L'ordre des tests *est* la règle : ce qui se raconte le mieux passe devant.
 * Une fermeture ratée écrase tout le reste — c'est ce dont on parlera —, un
 * score négatif ensuite, et seul le classement décide de ce qui reste.
 */
export function roundMood(scores: readonly RoundScore[], youId: string): RoundMood {
  const mine = scores.find((s) => s.playerId === youId);
  if (!mine) return 'middle';

  if (mine.doubled) return 'doubled';
  if (mine.final < 0) return 'negative';
  if (mine.final === 0) return 'zero';
  if (mine.closedRound) return 'closed';
  if (scores.some((s) => s.doubled)) return 'theyDoubled';

  const totals = scores.map((s) => s.final);
  const best = Math.min(...totals);
  const worst = Math.max(...totals);

  if (mine.final === best) {
    // L'écart qui compte en tête, c'est celui avec le premier poursuivant —
    // pas avec le dernier, qui peut être très loin sans que la manche ait été
    // simple pour autant. À égalité, il n'y en a pas : c'est serré par nature.
    const chaser = totals.filter((t) => t > best).sort((a, b) => a - b)[0];
    const lead = chaser === undefined ? 0 : chaser - best;
    if (lead >= BLOWOUT) return 'soloWin';
    if (lead <= TIGHT) return 'tightWin';
    return 'win';
  }

  if (mine.final === worst) {
    const gap = mine.final - best;
    if (gap >= CRUSHED) return 'crushed';
    if (gap <= TIGHT) return 'tightLoss';
    return 'loss';
  }

  if (mine.final >= HEAVY) return 'heavy';
  return 'middle';
}

export function gameMood(iWon: boolean, margin: number): GameMood {
  if (iWon) {
    if (margin >= 30) return 'winBig';
    if (margin <= 5) return 'winTight';
    return 'win';
  }
  if (margin >= 30) return 'loseBig';
  if (margin <= 5) return 'loseTight';
  return 'lose';
}

/**
 * Un entier bien mélangé à partir d'une graine.
 *
 * Deux manches consécutives ont des versions voisines : sans brassage, elles
 * tireraient deux phrases voisines dans le pool — et sur un pool de dix, deux
 * voisines reviennent vite à la même.
 */
function shuffle(seed: number): number {
  let x = (seed | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function pickQuip(pool: readonly string[], seed: number): string {
  return pool[shuffle(seed) % pool.length];
}

/**
 * La graine d'une fin de manche.
 *
 * La version de la partie suffirait, mais elle est la même pour tout le monde :
 * deux joueurs dans la même situation liraient mot pour mot la même phrase,
 * côte à côte sur la banquette. L'identifiant du joueur les décale.
 */
function seedOf(view: GameView): number {
  let seed = Math.imul(view.version, 31) + view.round;
  for (let i = 0; i < view.you.id.length; i += 1) {
    seed = (Math.imul(seed, 33) + view.you.id.charCodeAt(i)) | 0;
  }
  return seed;
}

/** La pique de fin de manche, prête à afficher. */
export function roundQuip(view: GameView): Quip {
  const mood = roundMood(view.lastRoundScores ?? [], view.you.id);
  return { line: pickQuip(ROUND_QUIPS[mood], seedOf(view)), tone: ROUND_TONES[mood] };
}

/** La pique de fin de partie : même principe, pool plus court — on ne la lit qu'une fois. */
export function gameQuip(view: GameView): string {
  const iWon = view.winnerId === view.you.id;
  const totals = view.players.map((p) => p.totalScore).sort((a, b) => a - b);
  const mine = view.players.find((p) => p.id === view.you.id)?.totalScore ?? 0;
  // L'écart qui raconte la partie : pour le vainqueur, ce qu'il a mis au second ;
  // pour les autres, ce qui les sépare du vainqueur.
  const margin = iWon ? (totals[1] ?? totals[0]) - totals[0] : mine - totals[0];
  return pickQuip(GAME_QUIPS[gameMood(iWon, margin)], seedOf(view));
}
