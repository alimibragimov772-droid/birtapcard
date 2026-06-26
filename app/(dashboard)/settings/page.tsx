'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Типы ───────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  user_id: string
  full_name: string | null
  role: string | null
  company_id: string | null
  companies?: { name: string } | null
}

// ─── Хелперы (дублируются в каждой странице) ─────────────────────────────────

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

function Panel({ title, sub, children }: {
  title?: string; sub?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
      {title && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

function StatusMsg({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null
  return (
    <div style={{
      marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
      background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)',
      border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      {msg.text}
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Владелец',
  branch_manager: 'Менеджер филиала',
}

const ROLE_COLOR: Record<string, string> = {
  super_admin: 'var(--mint)',
  owner: 'var(--orange)',
  branch_manager: 'var(--blue)',
}

// ─── Главная страница ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Форма профиля
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Форма смены пароля
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    setEmail(user.email ?? '')

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, role, company_id, companies!company_id(name)')
      .eq('user_id', user.id)
      .single()

    if (prof) {
      const company = Array.isArray(prof.companies)
        ? (prof.companies[0] ?? null)
        : (prof.companies ?? null)
      setProfile({ ...prof, companies: company } as Profile)
      setFullName(prof.full_name ?? '')
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleSaveProfile() {
    if (!profile) return
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'err', text: 'Ошибка при сохранении имени' })
    } else {
      setProfileMsg({ type: 'ok', text: 'Имя успешно обновлено' })
      await load()
    }
    setTimeout(() => setProfileMsg(null), 3000)
  }

  async function handleSavePassword() {
    setPasswordMsg(null)
    if (!newPassword) {
      setPasswordMsg({ type: 'err', text: 'Введите новый пароль' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'err', text: 'Пароль должен быть не менее 8 символов' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: 'Пароли не совпадают' })
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordMsg({ type: 'err', text: error.message ?? 'Ошибка при смене пароля' })
    } else {
      setPasswordMsg({ type: 'ok', text: 'Пароль успешно изменён' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setTimeout(() => setPasswordMsg(null), 4000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Загрузка...</div>
      </div>
    )
  }

  const role = profile?.role ?? 'branch_manager'
  const roleColor = ROLE_COLOR[role] ?? 'var(--text-muted)'

  // Инициалы для аватара
  const initials = (fullName || email || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ maxWidth: 700 }}>

      {/* Аватар + инфо */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 24, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
          background: `${roleColor}22`,
          border: `2px solid ${roleColor}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, color: roleColor,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {fullName || '—'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>{email}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
              background: `${roleColor}18`, color: roleColor, letterSpacing: 0.3,
            }}>
              {ROLE_LABEL[role] ?? role}
            </span>
            {profile?.companies && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                · {(profile.companies as { name: string }).name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Профиль */}
      <div style={{ marginBottom: 16 }}>
        <Panel title="Личные данные" sub="Имя, отображаемое в системе">
          <FormField label="Полное имя">
            <input
              style={inputStyle()}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Введите ваше имя"
              onFocus={e => (e.target.style.borderColor = 'var(--mint)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </FormField>

          <FormField label="Email">
            <input
              style={{ ...inputStyle(), opacity: 0.6, cursor: 'not-allowed' }}
              value={email}
              readOnly
            />
          </FormField>

          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 16,
            background: 'rgba(59,130,246,0.08)', color: 'var(--blue)',
            border: '1px solid rgba(59,130,246,0.15)',
          }}>
            ℹ️ Email изменить нельзя — он привязан к вашей учётной записи.
          </div>

          <StatusMsg msg={profileMsg} />

          <PrimaryButton onClick={handleSaveProfile} disabled={savingProfile || !fullName.trim()}>
            {savingProfile ? 'Сохраняем...' : '💾 Сохранить имя'}
          </PrimaryButton>
        </Panel>
      </div>

      {/* Смена пароля */}
      <Panel title="Смена пароля" sub="Минимум 8 символов">
        <FormField label="Новый пароль">
          <div style={{ position: 'relative' }}>
            <input
              style={inputStyle()}
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Введите новый пароль"
              onFocus={e => (e.target.style.borderColor = 'var(--mint)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 14, padding: '0 4px',
              }}
            >
              {showNew ? '🙈' : '👁️'}
            </button>
          </div>
        </FormField>

        <FormField label="Подтверждение пароля">
          <div style={{ position: 'relative' }}>
            <input
              style={{
                ...inputStyle(),
                borderColor: confirmPassword && confirmPassword !== newPassword
                  ? 'var(--danger)' : undefined,
              }}
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
              onFocus={e => (e.target.style.borderColor = 'var(--mint)')}
              onBlur={e => (e.target.style.borderColor = confirmPassword && confirmPassword !== newPassword ? 'var(--danger)' : 'var(--border)')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 14, padding: '0 4px',
              }}
            >
              {showConfirm ? '🙈' : '👁️'}
            </button>
          </div>
          {confirmPassword && confirmPassword !== newPassword && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>Пароли не совпадают</div>
          )}
        </FormField>

        {/* Индикатор силы пароля */}
        {newPassword && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map(i => {
                const strength = newPassword.length >= 12 ? 4 : newPassword.length >= 10 ? 3 : newPassword.length >= 8 ? 2 : 1
                return (
                  <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: i <= strength
                      ? strength >= 4 ? 'var(--mint)' : strength >= 3 ? 'var(--blue)' : strength >= 2 ? 'var(--orange)' : 'var(--danger)'
                      : 'var(--border)',
                    transition: 'background 0.2s',
                  }} />
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {newPassword.length < 8 ? 'Слабый — нужно 8+ символов'
                : newPassword.length < 10 ? 'Нормальный'
                : newPassword.length < 12 ? 'Хороший'
                : 'Надёжный'}
            </div>
          </div>
        )}

        <StatusMsg msg={passwordMsg} />

        <PrimaryButton
          onClick={handleSavePassword}
          disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
        >
          {savingPassword ? 'Меняем пароль...' : '🔒 Изменить пароль'}
        </PrimaryButton>
      </Panel>

      {/* Информация об аккаунте */}
      <div style={{
        marginTop: 16,
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          ℹ️ Информация об аккаунте
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Роль в системе', ROLE_LABEL[role] ?? role],
            ['Компания', (profile?.companies as { name: string } | null)?.name ?? '—'],
            ['ID пользователя', profile?.user_id ?? '—'],
          ].map(([key, val]) => (
            <div key={key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{key}</span>
              <span style={{
                fontSize: key === 'ID пользователя' ? 11 : 12.5,
                color: 'var(--text-dim)',
                fontFamily: key === 'ID пользователя' ? 'var(--font-mono, monospace)' : 'inherit',
              }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
