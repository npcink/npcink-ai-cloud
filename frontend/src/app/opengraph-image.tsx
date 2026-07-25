import { ImageResponse } from 'next/og';

export const alt = 'Npcink AI Cloud — hosted AI runtime for WordPress';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'stretch',
          background: '#0b1424',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: '72px 80px',
          width: '100%',
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 24 }}>
          <div
            style={{
              alignItems: 'center',
              background: '#2357ff',
              display: 'flex',
              fontSize: 36,
              fontWeight: 900,
              height: 72,
              justifyContent: 'center',
              width: 72,
            }}
          >
            N
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 6 }}>
            NPCINK AI CLOUD
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ color: '#9eb3ff', fontSize: 28, fontWeight: 800 }}>
            WORDPRESS × HOSTED AI RUNTIME
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            <span>Run AI in the cloud.</span>
            <span>Keep control in your site.</span>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 28 }}>
            托管运行、用量证据与面向人的服务诊断
          </div>
        </div>
      </div>
    ),
    size
  );
}
