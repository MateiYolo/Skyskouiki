import type { MetadataRoute } from 'next';

/** Manifeste PWA : « Ajouter à l'écran d'accueil » donne une vraie appli plein écran. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Skyskouiki',
    short_name: 'Skyskouiki',
    description: 'Le Skyjo à deux, chacun sur son téléphone.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0716',
    theme_color: '#0b0716',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
