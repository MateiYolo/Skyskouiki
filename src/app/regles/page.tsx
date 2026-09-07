import Link from 'next/link';
import type { Metadata } from 'next';
import { PlayingCard } from '@/components/PlayingCard';

export const metadata: Metadata = {
  title: 'Règles · Skyskouiki',
  description: 'Les règles officielles du Skyjo, en français.',
};

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/10 py-6">
      <h2 className="mb-3 flex items-baseline gap-2.5 text-lg font-bold">
        <span className="tnum text-xs font-black text-accent">{n}</span>
        {title}
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
        Celles du jeu original, sans variante maison. But du jeu&nbsp;: avoir le plus petit total.
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

      <Section n="04" title="Les colonnes">
        <p>
          Trois cartes <Key>identiques face visible dans une même colonne</Key>&nbsp;? Les trois
          disparaissent de ta grille et filent à la défausse. Elles ne comptent plus un seul point.
        </p>
        <p>
          Ça marche pour toutes les valeurs — y compris une colonne de -2, même si c’est un peu du
          gâchis.
        </p>
      </Section>

      <Section n="05" title="Fin de manche">
        <p>
          Dès qu’un joueur a <Key>retourné toutes ses cartes</Key>, la manche se termine&nbsp;: chacun
          des autres joue <Key>encore un tour</Key>, puis tout le monde révèle sa grille.
        </p>
        <p>
          Une colonne de trois cartes identiques qui apparaît à ce dévoilement final est retirée
          elle aussi, avant de compter.
        </p>
      </Section>

      <Section n="06" title="Le comptage (et le piège)">
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

      <Section n="07" title="Fin de partie">
        <p>
          On enchaîne les manches. Dès que quelqu’un atteint <Key>100 points ou plus</Key>, la partie
          s’arrête à la fin de cette manche. Le <Key>plus petit total</Key> l’emporte.
        </p>
      </Section>

      <Section n="08" title="Cas particulier">
        <p>
          Si la pioche s’épuise, on mélange la défausse — sauf sa carte du dessus — pour en refaire
          une.
        </p>
      </Section>

      <p className="border-t border-white/10 pt-6 text-xs leading-relaxed text-ink-faint">
        Skyjo est un jeu de Magilano. Skyskouiki est une implémentation personnelle de ses règles,
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
