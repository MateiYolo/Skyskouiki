import type { Metadata } from 'next';
import { GameClient } from './GameClient';

export const metadata: Metadata = { title: 'Partie · Skouikjo' };

/**
 * Aucun code connu d'avance, et c'est le but.
 *
 * Sans cette liste — fût-elle vide — Next rend la page à la demande : chaque
 * ouverture de salon réveille une fonction serverless pour produire une
 * coquille qui ne dépend de rien d'autre que du code dans l'URL. Avec elle, la
 * page est mise en cache à la première visite et servie depuis le réseau de
 * diffusion ensuite. Le premier joueur qui entre ne paie plus le réveil, et
 * c'est précisément le moment où il tape le plus vite.
 */
export function generateStaticParams() {
  return [];
}

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GameClient code={code.toUpperCase()} />;
}
