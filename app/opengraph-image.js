import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Ведело - CRM для артистов'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'linear-gradient(135deg, #f7f1df 0%, #ffffff 48%, #ead19a 100%)',
          color: '#17120a',
          padding: 72,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: 24,
              background: '#17120a',
              color: '#ebd3a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 42,
              fontWeight: 800,
            }}
          >
            A
          </div>
          Ведело
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              fontSize: 72,
              lineHeight: 1.05,
              fontWeight: 800,
              maxWidth: 960,
              letterSpacing: 0,
            }}
          >
            CRM для артистов, заявок, оплат и мероприятий
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              color: '#4b3b20',
              maxWidth: 940,
            }}
          >
            Клиенты, финансы, договоры, напоминания и Google Календарь в одном
            кабинете.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 24,
            fontWeight: 700,
            color: '#17120a',
          }}
        >
          {['Заявки', 'Финансы', 'Документы', 'Напоминания'].map((item) => (
            <div
              key={item}
              style={{
                padding: '14px 22px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.72)',
                border: '2px solid rgba(23,18,10,0.12)',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
