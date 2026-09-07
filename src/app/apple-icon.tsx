import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
            width: 104,
            height: 138,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            background: 'linear-gradient(160deg, #ffdc5e 0%, #e0a908 100%)',
            color: '#3d2b00',
            fontSize: 78,
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
