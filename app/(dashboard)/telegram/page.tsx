'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Типы ───────────────────────────────────────────────────────────────────

type TelegramSetting = {
  id: string
  company_id: string
  chat_id: string | null
  notify_daily: boolean
  active: boolean
  created_at: string
  companies?: { name: string; slug: string } | null
}

type CompanyOption = { id: string; name: string }
type Profile = { role: string | null; company_id: string | null }

// ─── Хелперы (дублируются в каждой странице, не выносятся в lib) ────────────

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.18s',
  }
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6,
        display: 'block', textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', border: 'none', fontFamily: 'inherit',
        background: disabled ? 'var(--border)' : 'var(--mint)',
        color: disabled ? 'var(--text-muted)' : 'var(--bg)',
        transition: 'all 0.18s',
      }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        background: 'var(--card2)', border: '1px solid var(--border)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-dim)',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.18s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-dim)' }}
    >
      {children}
    </button>
  )
}

function Panel({ title, sub, children, action }: {
  title?: string; sub?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            {title && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>}
            {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative',
          background: checked ? 'var(--mint)' : 'var(--border)',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</span>}
    </div>
  )
}

// ─── Карточка компании с настройками Telegram ────────────────────────────────

function CompanyTelegramCard({
  company,
  setting,
  onSave,
}: {
  company: CompanyOption
  setting: TelegramSetting | null
  onSave: (companyId: string, data: { chat_id: string; notify_daily: boolean; active: boolean }) => Promise<void>
}) {
  const [chatId, setChatId] = useState(setting?.chat_id ?? '')
  const [notifyDaily, setNotifyDaily] = useState(setting?.notify_daily ?? true)
  const [active, setActive] = useState(setting?.active ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Обновляем локальное состояние, если пришли новые данные
  useEffect(() => {
    setChatId(setting?.chat_id ?? '')
    setNotifyDaily(setting?.notify_daily ?? true)
    setActive(setting?.active ?? false)
  }, [setting])

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      await onSave(company.id, { chat_id: chatId.trim(), notify_daily: notifyDaily, active })
      setMsg({ type: 'ok', text: 'Настройки сохранены' })
    } catch {
      setMsg({ type: 'err', text: 'Ошибка при сохранении' })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }

  async function handleTest() {
    if (!chatId.trim()) {
      setMsg({ type: 'err', text: 'Сначала укажите Chat ID' })
      setTimeout(() => setMsg(null), 3000)
      return
    }
    setTesting(true)
    setMsg(null)
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId.trim(), company_name: company.name }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg({ type: 'ok', text: '✅ Тестовое сообщение отправлено!' })
      } else {
        setMsg({ type: 'err', text: json.error ?? 'Telegram не ответил' })
      }
    } catch {
      setMsg({ type: 'err', text: 'Ошибка подключения к Telegram' })
    } finally {
      setTesting(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <Panel
      title={company.name}
      sub={setting ? 'Настройки сохранены' : 'Не настроено'}
      action={
        <div style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 6,
          background: active ? 'rgba(0,212,170,0.12)' : 'rgba(100,116,139,0.12)',
          color: active ? 'var(--mint)' : 'var(--text-muted)',
          fontWeight: 600,
        }}>
          {active ? '● Активен' : '○ Отключён'}
        </div>
      }
    >
      <FormField label="Chat ID" hint="ID чата или канала Telegram (например: -1001234567890)">
        <input
          style={inputStyle()}
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          placeholder="-1001234567890"
          onFocus={e => (e.target.style.borderColor = 'var(--mint)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
      </FormField>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <Toggle
          checked={notifyDaily}
          onChange={setNotifyDaily}
          label="Ежедневные отчёты (каждое утро в 08:00 по Ташкенту)"
        />
        <Toggle
          checked={active}
          onChange={setActive}
          label="Уведомления включены"
        />
      </div>

      {msg && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PrimaryButton onClick={handleSave} disabled={saving}>
          {saving ? 'Сохраняем...' : '💾 Сохранить'}
        </PrimaryButton>
        <GhostButton onClick={handleTest} disabled={testing || !chatId.trim()}>
          {testing ? 'Проверяем...' : '🔔 Проверить подключение'}
        </GhostButton>
      </div>
    </Panel>
  )
}

// ─── Главная страница ────────────────────────────────────────────────────────

export default function TelegramPage() {
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [settings, setSettings] = useState<TelegramSetting[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single()

    setProfile({ role: prof?.role ?? null, company_id: prof?.company_id ?? null })

    const role = prof?.role

    // Загружаем компании: только super_admin может видеть и настраивать Telegram
    let companiesData: CompanyOption[] = []
    if (role === 'super_admin') {
      const { data } = await supabase
        .from('companies')
        .select('id, name')
        .eq('active', true)
        .order('name')
      companiesData = data ?? []
    }

    setCompanies(companiesData)

    if (companiesData.length > 0) {
      const ids = companiesData.map(c => c.id)
      const { data: tgData } = await supabase
        .from('telegram_settings')
        .select('*')
        .in('company_id', ids)
      setSettings(tgData ?? [])
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleSave(
    companyId: string,
    data: { chat_id: string; notify_daily: boolean; active: boolean },
  ) {
    const existing = settings.find(s => s.company_id === companyId)
    if (existing) {
      const { error } = await supabase
        .from('telegram_settings')
        .update({ chat_id: data.chat_id, notify_daily: data.notify_daily, active: data.active })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('telegram_settings')
        .insert({ company_id: companyId, chat_id: data.chat_id, notify_daily: data.notify_daily, active: data.active })
      if (error) throw error
    }
    await load()
  }

  // Only super_admin can access Telegram settings
  if (!loading && profile?.role !== 'super_admin') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Доступ ограничен</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>
          Управление Telegram-уведомлениями доступно только для Super Admin.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Загрузка...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Инфо-блок */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,170,0.08), rgba(59,130,246,0.06))',
        border: '1px solid rgba(0,212,170,0.2)', borderRadius: 12, padding: 20, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: 'var(--mint)',
            background: 'rgba(0,212,170,0.12)', padding: '3px 8px', borderRadius: 4,
          }}>
            ✦ КАК ЭТО РАБОТАЕТ
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>Ежедневные отчёты</strong> отправляются каждый день в{' '}
          <strong style={{ color: 'var(--mint)' }}>08:00 по Ташкенту</strong>. Содержат: сканирования · уникальные
          посетители · конверсию · лучший филиал дня. Укажите Chat ID вашего Telegram-чата или канала и нажмите
          «Проверить подключение».
        </div>
      </div>

      {/* Пример отчёта */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 20, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          📋 Пример отчёта
        </div>
        <div style={{
          background: 'var(--bg2)', borderRadius: 10, padding: 16,
          fontSize: 13, lineHeight: 1.9, fontFamily: 'var(--font-mono, monospace)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ color: 'var(--mint)', fontWeight: 700, marginBottom: 6 }}>
            📊 BirTapCard · Отчёт за 26.06.2026
          </div>
          <div>🏪 <strong>Grand Registan</strong></div>
          <div style={{ color: 'var(--text-dim)' }}>📡 NFC: 247 сканирований</div>
          <div style={{ color: 'var(--text-dim)' }}>⬛ QR: 389 сканирований</div>
          <div style={{ color: 'var(--mint)' }}>📈 Конверсия: 81.3%</div>
          <div style={{ color: 'var(--text-dim)' }}>👥 Уникальных: 512</div>
          <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 11 }}>
            🏆 Лучший филиал: Grand Airport (+23%)
          </div>
        </div>
      </div>

      {/* Настройки по компаниям */}
      {companies.length === 0 ? (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Нет доступных компаний</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {companies.map(company => (
            <CompanyTelegramCard
              key={company.id}
              company={company}
              setting={settings.find(s => s.company_id === company.id) ?? null}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {/* Инструкция */}
      <div style={{
        marginTop: 24, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          🛠️ Как получить Chat ID
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['1', 'Создайте Telegram-бота через @BotFather и получите токен (он уже задан в системе)'],
            ['2', 'Добавьте бота в ваш чат или канал как администратора'],
            ['3', 'Перешлите любое сообщение из чата боту @userinfobot — он покажет Chat ID'],
            ['4', 'Для каналов Chat ID начинается с -100...'],
          ].map(([num, text]) => (
            <div key={num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: 'var(--mint-dim)',
                color: 'var(--mint)', fontWeight: 700, fontSize: 12, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {num}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, paddingTop: 3 }}>
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
