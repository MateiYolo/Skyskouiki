import type { Metadata, Viewport } from 'next';
import { Outfit, Press_Start_2P } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * La police des bornes d'arcade. Elle n'habille que le cadre — annonces,
 * scores, codes, titres — jamais les cartes ni les consignes : la table reste
 * une table, c'est la borne autour qui clignote.
 */
const arcade = Press_Start_2P({
  variable: '--font-press-start',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Skouikjo',
  description: 'Le Skyjo à deux, chacun sur son téléphone. Règles officielles, trois règles maison, zéro pub.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Skouikjo' },
};

export const viewport: Viewport = {
  themeColor: '#0b0716',
  // La grille doit tenir à l'écran : pas de zoom pincé qui casse la mise en page.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${outfit.variable} ${arcade.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
