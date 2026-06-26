'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError('Неверный email или пароль')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#070C1A',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          width: 380,
          background: '#111827',
          border: '1px solid #1E2D4A',
          borderRadius: 16,
          padding: '36px 32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #00D4AA, #00A882)',
            }}
          />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E8F0' }}>BirTapCard</div>
            <div
              style={{
                fontSize: 10,
                color: '#00D4AA',
                fontWeight: 500,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Аналитика
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="you@company.uz"
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>Пароль</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />

          {error && (
            <div style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              marginTop: 24,
              padding: '11px 0',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#0A9C82' : '#00D4AA',
              color: '#070C1A',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94A3B8',
  marginBottom: 6,
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #1E2D4A',
  background: '#0D1528',
  color: '#E2E8F0',
  fontSize: 14,
  outline: 'none',
}
