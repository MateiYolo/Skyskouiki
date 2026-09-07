import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** Icône générée au build : une carte jaune posée sur le fond de la table. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(150deg, #2c1a58 0%, #0b0716 100%)',
        }}
      >
        <div
          style={{
            width: 300,
            height: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 48,
            background: 'linear-gradient(160deg, #ffdc5e 0%, #e0a908 100%)',
            color: '#3d2b00',
            fontSize: 220,
            fontWeight: 900,
            transform: 'rotate(-8deg)',
          }}
        >
          S
        </div>
      </div>
    ),
    size,
  );
}
