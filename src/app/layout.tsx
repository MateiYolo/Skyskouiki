import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Skyskouiki',
  description: 'Le Skyjo à deux, chacun sur son téléphone. Règles officielles, une règle maison, zéro pub.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Skyskouiki' },
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
    <html lang="fr" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
