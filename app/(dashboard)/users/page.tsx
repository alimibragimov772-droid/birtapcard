'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Типы ───────────────────────────────────────────────────────────────────

type UserRow = {
  id: string
  user_id: string
  role: string
  company_id: string | null
  full_name: string | null
  created_at: string
  companies?: { name: string; slug: string } | null
  // email подтягивается отдельно через admin или хранится в profiles — здесь берём из auth через join
  email?: string | null
}

type BranchUserRow = {
  id: string
  user_id: string
  branch_id: string
  role: string
  branches?: { name: string; company_id: string; companies?: { name: string } | null } | null
}

// Объединённая строка таблицы
type DisplayUser = {
  user_id: string
  full_name: string | null
  email: string | null
  profile_role: string
  company_name: string | null
  company_id: string | null
  branch_roles: { branch_name: string; role: string }[]
  active: boolean
  created_at: string
  profile_id: string
}

type Profile = { role: string | null; user_id: string }
type CompanyOption = { id: string; name: string }

// ─── Вспомогательные компоненты (стиль идентичен dashboard/analytics/companies/branches/qrcodes) ──

function KpiCard({
  label, value, sub, accent, icon,
}: {
  label: string; value: string | number; sub: string
  accent: 'mint' | 'orange' | 'blue' | 'purple'; icon: string
}) {
  const colors = {
    mint:   { val: 'var(--mint)',   dim: 'var(--mint-dim)',       bar: 'linear-gradient(90deg, var(--mint), transparent)' },
    orange: { val: 'var(--orange)', dim: 'var(--orange-dim)',     bar: 'linear-gradient(90deg, var(--orange), transparent)' },
    blue:   { val: 'var(--blue)',   dim: 'rgba(59,130,246,0.12)', bar: 'linear-gradient(90deg, var(--blue), transparent)' },
    purple: { val: 'var(--purple)', dim: 'rgba(139,92,246,0.12)', bar: 'linear-gradient(90deg, var(--purple), transparent)' },
  }
  const c = colors[accent]
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '18px 20px', position: 'relative', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = c.val)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: c.bar }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: c.dim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
          {icon}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
        fontSize: 28, fontWeight: 600, lineHeight: 1, marginBottom: 6, color: c.val,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
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

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.18s',
  }
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6,
        display: 'block', textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </label>
      {children}
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

function GhostButton({ children, onClick, danger, disabled }: {
  children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        background: 'var(--card2)', border: '1px solid var(--border)',
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger)' : 'var(--text-dim)',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.18s',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text)'; e.currentTarget.style.borderColor = danger ? 'var(--danger)' : 'var(--text-muted)' } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
    >
      {children}
    </button>
  )
}

// ─── Бейдж роли ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  branch_manager: 'Branch Manager',
}
const ROLE_COLORS: Record<string, string> = {
  super_admin: 'var(--purple)',
  owner: 'var(--mint)',
  branch_manager: 'var(--blue)',
}
const ROLE_DIMS: Record<string, string> = {
  super_admin: 'rgba(139,92,246,0.12)',
  owner: 'var(--mint-dim)',
  branch_manager: 'rgba(59,130,246,0.12)',
}

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? 'var(--text-muted)'
  const bg = ROLE_DIMS[role] ?? 'rgba(100,116,139,0.12)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      background: bg, color,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

// ─── Аватар-инициалы ─────────────────────────────────────────────────────────

function Avatar({ name, role }: { name: string | null; role: string }) {
  const initials = (name ?? '??')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
  const color = ROLE_COLORS[role] ?? 'var(--text-muted)'
  const bg = ROLE_DIMS[role] ?? 'rgba(100,116,139,0.12)'
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: bg, border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color,
    }}>
      {initials}
    </div>
  )
}

// ─── Модалка редактирования пользователя ────────────────────────────────────

function EditUserModal({
  user,
  companies,
  onClose,
  onSaved,
}: {
  user: DisplayUser
  companies: CompanyOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole] = useState(user.profile_role)
  const [companyId, setCompanyId] = useState(user.company_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)

    const res = await fetch('/api/users/manage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: user.profile_id,
        full_name: fullName.trim() || null,
        role,
        company_id: role === 'super_admin' ? null : (companyId || null),
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Не удалось сохранить')
      setSaving(false)
      return
    }
    onSaved()
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle(),
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748B'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
    cursor: 'pointer',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        width: '100%', maxWidth: 460, padding: 28,
      }}>
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Редактировать пользователя</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{user.email ?? user.user_id}</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--card2)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Форма */}
        <FormField label="Полное имя">
          <input
            style={inputStyle()}
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Имя Фамилия"
          />
        </FormField>

        <FormField label="Роль">
          <select style={selectStyle} value={role} onChange={e => setRole(e.target.value)}>
            <option value="super_admin">Super Admin</option>
            <option value="owner">Owner</option>
            <option value="branch_manager">Branch Manager</option>
          </select>
        </FormField>

        {role !== 'super_admin' && (
          <FormField label="Компания">
            <select
              style={selectStyle}
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
            >
              <option value="">— Не привязан —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
        )}

        {error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)',
            color: 'var(--danger)', fontSize: 12.5,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <GhostButton onClick={onClose}>Отмена</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение…' : '✓ Сохранить'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ─── Основной компонент ──────────────────────────────────────────────────────

export default function UsersPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [users, setUsers] = useState<DisplayUser[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [companyFilter, setCompanyFilter] = useState<string>('all')

  const [editing, setEditing] = useState<DisplayUser | null>(null)

  // ── Загрузка профиля текущего пользователя ───────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setProfileLoaded(true); return }
      const { data } = await supabase
        .from('profiles')
        .select('role, user_id')
        .eq('user_id', user.id)
        .single()
      setProfile(data as Profile | null)
      setProfileLoaded(true)
    })
  }, [])

  const isSuperAdmin = profile?.role === 'super_admin'

  // ── Загрузка данных ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [profilesRes, branchUsersRes, companiesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, user_id, role, company_id, full_name, created_at, companies(name, slug)')
        .order('created_at', { ascending: false }),
      supabase
        .from('branch_users')
        .select('id, user_id, branch_id, role, branches(name, company_id, companies(name))'),
      supabase
        .from('companies')
        .select('id, name')
        .order('name'),
    ])

    setCompanies((companiesRes.data as CompanyOption[] | null) ?? [])

    const rawProfiles = (profilesRes.data as UserRow[] | null) ?? []
    const rawBranchUsers = (branchUsersRes.data as BranchUserRow[] | null) ?? []

    // Собираем branch_roles для каждого user_id
    const branchRolesMap: Record<string, { branch_name: string; role: string }[]> = {}
    for (const bu of rawBranchUsers) {
      if (!branchRolesMap[bu.user_id]) branchRolesMap[bu.user_id] = []
      branchRolesMap[bu.user_id].push({
        branch_name: bu.branches?.name ?? bu.branch_id,
        role: bu.role,
      })
    }

    const displayed: DisplayUser[] = rawProfiles.map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: null, // email хранится в auth.users, напрямую не доступен из клиента
      profile_role: p.role ?? 'branch_manager',
      company_name: (p.companies as { name: string; slug: string } | null)?.name ?? null,
      company_id: p.company_id,
      branch_roles: branchRolesMap[p.user_id] ?? [],
      active: true, // статус в profiles не предусмотрен схемой — считаем всех активными
      created_at: p.created_at,
      profile_id: p.id,
    }))

    setUsers(displayed)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!profileLoaded) return
    if (isSuperAdmin) loadData()
    else setLoading(false)
  }, [profileLoaded, isSuperAdmin, loadData])

  // ── Фильтрация ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      if (roleFilter !== 'all' && u.profile_role !== roleFilter) return false
      if (companyFilter !== 'all' && u.company_id !== companyFilter) return false
      if (q) {
        const hay = [u.full_name, u.email, u.company_name].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [users, search, roleFilter, companyFilter])

  // ── KPI ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => ({
    total: users.length,
    owners: users.filter(u => u.profile_role === 'owner').length,
    managers: users.filter(u => u.profile_role === 'branch_manager').length,
    admins: users.filter(u => u.profile_role === 'super_admin').length,
  }), [users])

  // ── Спиннер загрузки ─────────────────────────────────────────────────────
  if (!profileLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--mint)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // ── Экран «Доступ ограничен» ──────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Доступ ограничен</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
          Управление пользователями доступно только для роли <strong>Super Admin</strong>.
        </div>
      </div>
    )
  }

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px', background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748B'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280 }}>
      {/* Заголовок */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Пользователи</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Управление ролями и доступом</div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Всего пользователей" value={kpi.total} sub="В системе" accent="mint" icon="👥" />
        <KpiCard label="Super Admin" value={kpi.admins} sub="Полный доступ" accent="purple" icon="⚡" />
        <KpiCard label="Owner" value={kpi.owners} sub="Владельцы ресторанов" accent="orange" icon="🏪" />
        <KpiCard label="Branch Manager" value={kpi.managers} sub="Управляющие филиалов" accent="blue" icon="🗂️" />
      </div>

      {/* Фильтры + поиск */}
      <Panel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Поиск */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
            <input
              style={{ ...inputStyle(), paddingLeft: 34, width: '100%' }}
              placeholder="Поиск по имени, ресторану…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Фильтр по роли */}
          <select style={selectStyle} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">Все роли</option>
            <option value="super_admin">Super Admin</option>
            <option value="owner">Owner</option>
            <option value="branch_manager">Branch Manager</option>
          </select>

          {/* Фильтр по компании */}
          <select style={selectStyle} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="all">Все рестораны</option>
            <option value="">Без ресторана</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Сброс */}
          {(search || roleFilter !== 'all' || companyFilter !== 'all') && (
            <GhostButton onClick={() => { setSearch(''); setRoleFilter('all'); setCompanyFilter('all') }}>
              ✕ Сбросить
            </GhostButton>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            Показано: <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> из {users.length}
          </div>
        </div>
      </Panel>

      {/* Таблица */}
      <div style={{ marginTop: 16 }}>
        <Panel>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
              <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--mint)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка пользователей…</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Пользователи не найдены</div>
              <div style={{ fontSize: 12 }}>Попробуйте изменить параметры поиска или фильтры</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Пользователь', 'Роль', 'Ресторан / Объект', 'Филиалы', 'Зарегистрирован', ''].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '10px 14px',
                        color: 'var(--text-muted)', fontWeight: 500,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Пользователь */}
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={u.full_name} role={u.profile_role} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                              {u.full_name ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Имя не указано</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                              {u.user_id.slice(0, 8)}…
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Роль */}
                      <td style={{ padding: '13px 14px' }}>
                        <RoleBadge role={u.profile_role} />
                      </td>

                      {/* Ресторан */}
                      <td style={{ padding: '13px 14px' }}>
                        {u.company_name ? (
                          <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>{u.company_name}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>—</span>
                        )}
                      </td>

                      {/* Филиалы */}
                      <td style={{ padding: '13px 14px' }}>
                        {u.branch_roles.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {u.branch_roles.slice(0, 3).map((br, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  display: 'inline-block', width: 6, height: 6,
                                  borderRadius: '50%', background: 'var(--blue)', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{br.branch_name}</span>
                              </div>
                            ))}
                            {u.branch_roles.length > 3 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                +{u.branch_roles.length - 3} ещё
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>—</span>
                        )}
                      </td>

                      {/* Дата регистрации */}
                      <td style={{ padding: '13px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(u.created_at).toLocaleDateString('ru-RU', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </td>

                      {/* Действия */}
                      <td style={{ padding: '13px 14px' }}>
                        <GhostButton onClick={() => setEditing(u)}>
                          ✏️ Редактировать
                        </GhostButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Информационная плашка */}
      <div style={{
        marginTop: 16, padding: '14px 18px',
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Пользователи добавляются в систему через регистрацию (Supabase Auth). После регистрации
          им автоматически создаётся профиль с ролью <strong>branch_manager</strong>.
          Здесь вы можете изменить роль, привязать к ресторану и скорректировать имя.
          Email пользователя хранится в Supabase Auth и доступен в разделе{' '}
          <span style={{ color: 'var(--blue)' }}>Authentication → Users</span> в консоли Supabase.
        </div>
      </div>

      {/* Модалка редактирования */}
      {editing && (
        <EditUserModal
          user={editing}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadData() }}
        />
      )}
    </div>
  )
}
