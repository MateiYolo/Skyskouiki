import type { Metadata } from 'next';
import { GameClient } from './GameClient';

export const metadata: Metadata = { title: 'Partie · Skyskouiki' };

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GameClient code={code.toUpperCase()} />;
}
