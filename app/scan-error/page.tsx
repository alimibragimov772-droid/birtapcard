export default function ScanErrorPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#070C1A',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'rgba(239,68,68,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          marginBottom: 24,
        }}
      >
        ⚠️
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', marginBottom: 8 }}>
        Ссылка недействительна
      </h1>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, lineHeight: 1.6 }}>
        Эта NFC или QR-метка не найдена в системе либо временно деактивирована.
        Обратитесь к администратору заведения.
      </p>
    </div>
  )
}
