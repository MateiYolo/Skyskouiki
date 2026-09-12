import Link from 'next/link';
import type { Metadata } from 'next';
import { PlayingCard } from '@/components/PlayingCard';
import { JOKER_CARD, STEAL_CARD, SWAP_CARD } from '@/lib/skyjo';

export const metadata: Metadata = {
  title: 'Règles · Skouikjo',
  description:
    'Les règles officielles du Skyjo, en français, plus deux règles maison et le mode spicy.',
};

function Section({
  n,
  title,
  house,
  spicy,
  children,
}: {
  n: string;
  title: string;
  /** Signale une règle qui n'existe pas dans le jeu original. */
  house?: boolean;
  /**
   * Signale une règle qui ne s'applique qu'au mode spicy.
   *
   * Distinct d'une règle maison, et la distinction compte : une règle maison est
   * toujours là, une règle spicy dépend d'un interrupteur dans le salon.
   */
  spicy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-6">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-2.5 text-lg font-bold">
        <span className="tnum text-xs font-black text-accent">{n}</span>
        {title}
        {house && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent">
            règle maison
          </span>
        )}
        {spicy && (
          <span className="rounded-full border border-steal/50 bg-steal/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-steal">
            mode spicy
          </span>
        )}
      </h2>
      <div className="space-y-3 text-[0.9rem] leading-relaxed text-ink-dim">{children}</div>
    </section>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

export default function RulesPage() {
  return (
    <main className="safe-bottom safe-top mx-auto w-full max-w-lg px-6 pb-16">
      <Link href="/" className="mb-6 inline-block text-sm text-ink-faint">
        ← Retour
      </Link>

      <h1 className="text-3xl font-black tracking-tight">Les règles</h1>
      <p className="mt-2 text-sm text-ink-dim">
        Celles du jeu original, plus deux règles maison — signalées là où elles s’appliquent. But
        du jeu&nbsp;: avoir le plus petit total. Les quatre dernières sections ne valent que pour le{' '}
        <Key>mode spicy</Key>, qui se choisit dans le salon avant de lancer la partie.
      </p>

      <Section n="01" title="Le matériel">
        <p>
          150 cartes&nbsp;: cinq <Key>-2</Key>, dix <Key>-1</Key>, quinze <Key>0</Key>, puis dix
          exemplaires de chaque valeur de <Key>1 à 12</Key>.
        </p>
        <p>
          La couleur dit la douleur, comme sur les vraies cartes&nbsp;: bleu pour les négatives,
          cyan pour le zéro, puis vert, jaune et rouge.
        </p>
        <div className="flex gap-2 pt-1">
          {[-2, 0, 3, 7, 11].map((value) => (
            <div key={value} className="w-11">
              <PlayingCard value={value} faceUp size="sm" />
            </div>
          ))}
        </div>
      </Section>

      <Section n="02" title="Mise en place">
        <p>
          Chaque joueur reçoit <Key>12 cartes face cachée</Key>, en 3 lignes de 4 colonnes. Le reste
          forme la pioche, et la première carte retournée ouvre la défausse.
        </p>
        <p>
          Chacun retourne <Key>2 cartes</Key> de son choix. Celui dont la somme des deux est la plus
          haute commence.
        </p>
      </Section>

      <Section n="03" title="Ton tour">
        <p>Deux options, une seule à choisir&nbsp;:</p>
        <ol className="ml-4 list-decimal space-y-2 marker:text-accent">
          <li>
            <Key>Piocher</Key> la carte du dessus de la pioche. Ensuite, soit tu l’échanges avec une
            de tes cartes (visible ou cachée, peu importe) et la carte remplacée part face visible
            sur la défausse&nbsp;; soit tu la jettes, et tu dois alors{' '}
            <Key>retourner une de tes cartes cachées</Key>.
          </li>
          <li>
            <Key>Prendre la carte de la défausse</Key> et l’échanger avec une de tes cartes. Celle-là,
            tu ne peux pas la rejeter&nbsp;: elle doit entrer dans ta grille.
          </li>
        </ol>
      </Section>

      <Section n="04" title="La carte en main se voit" house>
        <p>
          Ici, la carte que tu tiens est posée <Key>face visible</Key> au milieu de la table, même
          quand elle sort de la pioche. Tout le monde la voit, tout le monde sait ce que tu es en
          train de peser.
        </p>
        <p>
          Autour d’une vraie table, on regarde sa pioche à l’abri de sa main. Sur deux téléphones,
          ça donnait une carte grise au milieu de l’écran et un adversaire qui pose sans qu’on
          comprenne pourquoi&nbsp;: la moitié du plaisir de regarder l’autre jouer partait avec.
          Ça ne t’enlève rien&nbsp;— la décision reste la tienne, l’autre ne fait que suivre.
        </p>
      </Section>

      <Section n="05" title="Les colonnes">
        <p>
          Trois cartes <Key>identiques face visible dans une même colonne</Key>&nbsp;? Les trois
          disparaissent de ta grille et filent à la défausse. Elles ne comptent plus un seul point.
        </p>
        <p>
          Ça marche pour toutes les valeurs — y compris une colonne de -2, même si c’est un peu du
          gâchis.
        </p>
      </Section>

      <Section n="06" title="Les lignes" house>
        <p>
          Ici, une <Key>ligne entière de cartes identiques</Key> saute aussi. Ce n’est{' '}
          <Key>pas</Key> dans les règles du jeu de société&nbsp;: là-bas, seules les colonnes
          comptent. Si tu joues avec les vraies cartes un jour, oublie cette section.
        </p>
        <p>
          Il faut la <Key>ligne entière</Key>. Sur une grille intacte, ça veut dire les quatre —
          trois cartes identiques côte à côte et une quatrième différente ne suffisent pas, sinon
          les manches tourneraient trop court.
        </p>
        <p>
          En revanche, une <Key>colonne déjà éliminée ne compte plus</Key>. Si son trou coupe ta
          ligne, il reste trois cases&nbsp;: trois cartes identiques les remplissent entièrement, et
          la ligne saute. Un trou n’est pas une carte qui dépareille — c’est une carte qui n’est
          plus là.
        </p>
        <p>
          Une carte peut compléter une colonne et une ligne du même coup&nbsp;: les deux partent, et
          ça fait six cartes en moins d’un coup.
        </p>
      </Section>

      <Section n="07" title="Fin de manche">
        <p>
          Dès qu’un joueur a <Key>retourné toutes ses cartes</Key>, la manche se termine&nbsp;: chacun
          des autres joue <Key>encore un tour</Key>, puis tout le monde révèle sa grille.
        </p>
        <p>
          Les colonnes et les lignes qui apparaissent à ce dévoilement final sont retirées elles
          aussi, avant de compter.
        </p>
      </Section>

      <Section n="08" title="Le comptage (et le piège)">
        <p>Chacun additionne les cartes qui lui restent. Les négatives se soustraient.</p>
        <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-ink">
          <Key>La pénalité.</Key> Le joueur qui a fermé la manche <Key>double ses points</Key> s’il
          n’a pas, à lui seul, le plus petit total. Une simple égalité suffit à déclencher la
          pénalité. Elle ne s’applique jamais si son total est nul ou négatif.
        </p>
        <p>
          C’est tout le sel du jeu&nbsp;: fermer trop tôt avec un total moyen coûte souvent plus cher
          que d’attendre un tour de plus.
        </p>
      </Section>

      <Section n="09" title="Fin de partie">
        <p>
          On enchaîne les manches. Dès que quelqu’un atteint <Key>100 points ou plus</Key>, la partie
          s’arrête à la fin de cette manche. Le <Key>plus petit total</Key> l’emporte.
        </p>
      </Section>

      <Section n="10" title="Cas particulier">
        <p>
          Si la pioche s’épuise, on mélange la défausse — sauf sa carte du dessus — pour en refaire
          une.
        </p>
      </Section>

      <Section n="11" title="Le mode spicy" spicy>
        <p>
          Quatre nouvelles cartes dans le paquet, et rien d’autre&nbsp;: le tour de jeu, les colonnes,
          les lignes, le comptage et la pénalité de fermeture ne changent pas d’une virgule. L’hôte
          le choisit <Key>dans le salon</Key>, avant de distribuer&nbsp;; ensuite c’est figé pour
          toute la partie.
        </p>
        <div className="flex gap-2 pt-1">
          {([-5, JOKER_CARD, STEAL_CARD, SWAP_CARD] as const).map((card) => (
            <div key={String(card)} className="w-11">
              <PlayingCard value={card} faceUp size="sm" />
            </div>
          ))}
        </div>
      </Section>

      <Section n="12" title="Le -5 et les jokers" spicy>
        <p>
          <Key>Deux -5</Key> rejoignent le paquet. Rien de plus qu’une carte&nbsp;: elle se pose, se
          vole et part à la défausse comme les autres. Il n’y en a que deux, donc une colonne de -5
          est impossible — c’est du point sec, dix-sept d’écart avec un 12.
        </p>
        <p>
          <Key>Deux jokers</Key>. Chacun vaut <Key>0</Key>, et complète{' '}
          <Key>n’importe quel groupe</Key>&nbsp;: une colonne <Key>7 / joker / 7</Key> saute comme
          une colonne de trois 7. Un joker peut fermer une colonne et une ligne du même coup.
        </p>
        <p>
          Quand il ferme un groupe, il ne part <Key>pas</Key> à la défausse avec les autres&nbsp;:
          il <Key>quitte la manche</Key>. Sur la défausse, le joueur suivant n’avait qu’à se
          servir — la meilleure carte du paquet offerte à quelqu’un qui n’avait rien fait pour
          l’avoir&nbsp;; et rendu à la pioche, il revenait quand même, en l’annonçant à toute la
          table. Un joker se gagne une fois et se dépense une fois.
        </p>
        <p>
          Sa case ne s’envole donc vers <Key>aucune pile</Key>&nbsp;: elle s’efface sur place,
          pendant que le reste du groupe part à la défausse. C’est la seule carte du jeu qui
          disparaît comme ça — et la prochaine manche les redistribue.
        </p>
        <p>
          En revanche, si tu <Key>poses une carte dessus</Key>, il s’en va à la défausse comme
          n’importe quelle autre&nbsp;— et là, oui, quelqu’un peut le reprendre. Un groupe doit
          garder au moins une carte à valeur&nbsp;: <Key>joker / joker / 7</Key> vaut 7 et saute,
          mais trois jokers n’ont aucune valeur sur laquelle s’accorder et restent en place.
        </p>
      </Section>

      <Section n="13" title="La carte Vol" spicy>
        <p>
          <Key>Cinq cartes Vol</Key> sont glissées dans la pioche — et seulement là. Elles ne
          peuvent donc pas dormir dans une grille&nbsp;: un Vol ne se déclenche que si{' '}
          <Key>quelqu’un pioche</Key>. Compte environ un par manche.
        </p>
        <p>
          Quand tu en pioches une, tu ne la prends pas en main&nbsp;: tu <Key>échanges une de tes
          cartes contre celle d’un adversaire</Key>. <Key>N’importe laquelle</Key>, de chaque
          côté&nbsp;— une carte visible, ou un dos.
        </p>
        <p>
          La carte garde sa face en changeant de grille&nbsp;: un dos arrive chez toi sans se
          retourner, et <Key>personne ne l’a vu</Key>, pas même toi. C’est tout l’intérêt&nbsp;:
          refiler ton 12 pour un inconnu, ou lui prendre un dos au hasard en espérant mieux. Une
          carte visible, elle, arrive visible.
        </p>
        <p>
          Attention&nbsp;: le nombre de <Key>dos change de camp</Key>. Donner ton dernier dos contre
          une carte visible retourne toute ta grille&nbsp;— et <Key>ferme la manche</Key> sur-le-
          champ, pénalité comprise.
        </p>
        <p>
          Et les <Key>deux grilles</Key> rejouent leurs éliminations. Tu peux prendre la carte qui
          ferme ta colonne&nbsp;; tu peux aussi, sans le vouloir, laisser à ta victime celle qui
          ferme la sienne. Regarde sa grille avant de donner.
        </p>
        <p>
          Tu peux <Key>renoncer</Key>. Ça coûte un retournement, exactement comme si tu avais jeté
          une carte piochée&nbsp;: sans ce prix, refuser serait toujours le bon coup. Puis la carte
          quitte la manche.
        </p>
      </Section>

      <Section n="14" title="La carte Valse" spicy>
        <p>
          <Key>Quatre cartes Valse</Key> complètent la pioche, et comme le Vol elles n’existent{' '}
          <Key>que là</Key>&nbsp;: une Valse ne se déclenche que si tu la pioches.
        </p>
        <p>
          Elle ne touche <Key>que ta grille</Key>&nbsp;: tu désignes deux de tes cartes, et elles{' '}
          <Key>échangent leur place</Key>. Visible ou cachée, peu importe — de chaque côté.
        </p>
        <p>
          C’est la seule carte du jeu qui déplace ce que tu as déjà. Le 7 coincé en bas à droite
          pendant que deux autres 7 attendent dans la colonne d’à côté n’avait jusque-là aucun moyen
          de les rejoindre&nbsp;: il fallait en repiocher un troisième. Là, tu le déménages, et{' '}
          <Key>la colonne saute</Key>.
        </p>
        <p>
          La carte garde sa face en changeant de case&nbsp;: un dos reste un dos. Ton nombre de
          cartes cachées ne bouge donc pas d’une Valse — <Key>rien ne se révèle</Key>, rien ne se
          compte différemment. Ton total non plus, d’ailleurs&nbsp;: ce sont les éliminations
          qu’elle rend possibles qui le font baisser.
        </p>
        <p>
          Et déplacer deux dos est un vrai coup&nbsp;: tu ne sais pas ce que tu déménages, mais tu
          sais <Key>où</Key>.
        </p>
        <p>
          Comme pour le Vol, tu peux <Key>renoncer</Key>&nbsp;: ça coûte un retournement, puis la
          carte quitte la manche.
        </p>
      </Section>

      <p className="border-t border-white/10 pt-6 text-xs leading-relaxed text-ink-faint">
        Le mode spicy n’a rien d’officiel non plus&nbsp;: ces quatre cartes n’existent pas dans la
        boîte. Skyjo est un jeu de Magilano. Skouikjo est une implémentation personnelle de ses règles,
        sans lien avec l’éditeur, faite pour jouer à deux sur nos téléphones.
      </p>

      <Link
        href="/"
        className="mt-6 block w-full rounded-2xl bg-accent px-4 py-3.5 text-center font-bold text-felt-900"
      >
        Jouer
      </Link>
    </main>
  );
}
