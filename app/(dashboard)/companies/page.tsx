'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Типы ───────────────────────────────────────────────────────────────────

type Company = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  owner_id: string
  active: boolean
  created_at: string
  branches?: { id: string }[] | null
}

type Profile = { role: string | null; user_id: string }

// ─── Вспомогательные компоненты (стиль идентичен дашборду/аналитике) ───────

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

function PrimaryButton({ children, onClick, disabled, type = 'button' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
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

function GhostButton({ children, onClick, danger }: {
  children: React.ReactNode; onClick?: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
        background: 'var(--card2)', border: '1px solid var(--border)',
        color: danger ? 'var(--danger)' : 'var(--text-dim)',
        transition: 'all 0.18s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text)'; e.currentTarget.style.borderColor = danger ? 'var(--danger)' : 'var(--text-muted)' }}
      onMouseLeave={e => { e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {children}
    </button>
  )
}

// Переключатель active (визуально как toggle-switch)
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', position: 'relative',
        background: checked ? 'var(--mint)' : 'var(--border)', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/[а-яё]/g, ch => {
      const map: Record<string, string> = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
        й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
        у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      }
      return map[ch] ?? ''
    })
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Модальное окно создания/редактирования ─────────────────────────────────

function CompanyModal({
  company, onClose, onSaved,
}: {
  company: Company | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!company
  const [name, setName] = useState(company?.name ?? '')
  const [slug, setSlug] = useState(company?.slug ?? '')
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? '')
  const [active, setActive] = useState(company?.active ?? true)
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Введите название ресторана'); return }
    if (!slug.trim()) { setError('Введите slug'); return }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    if (isEdit) {
      const { error: updErr } = await supabase
        .from('companies')
        .update({ name: name.trim(), slug: slug.trim(), logo_url: logoUrl.trim() || null, active })
        .eq('id', company!.id)
      if (updErr) { setError(updErr.message); setSaving(false); return }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Сессия истекла, перезайдите'); setSaving(false); return }
      const { error: insErr } = await supabase
        .from('companies')
        .insert({ name: name.trim(), slug: slug.trim(), logo_url: logoUrl.trim() || null, active, owner_id: user.id })
      if (insErr) { setError(insErr.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
          padding: 28, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{isEdit ? '✏️ Редактировать ресторан' : '➕ Новый ресторан'}</span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'var(--card2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
              fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <FormField label="Название">
          <input
            style={inputStyle()}
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Grand Registan"
            autoFocus
          />
        </FormField>

        <FormField label="Slug (используется в ссылках)">
          <input
            style={inputStyle()}
            value={slug}
            onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
            placeholder="grand-registan"
          />
        </FormField>

        <FormField label="Логотип (URL, необязательно)">
          <input
            style={inputStyle()}
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </FormField>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '4px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Ресторан активен</span>
          <Toggle checked={active} onChange={() => setActive(v => !v)} />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <GhostButton onClick={onClose}>Отмена</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  // Загрузка профиля (для проверки роли)
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

  const canManage = profile?.role === 'super_admin'
  const canEdit = profile?.role === 'super_admin'

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name, slug, logo_url, owner_id, active, created_at, branches(id)')
      .order('created_at', { ascending: false })
    setCompanies((data as Company[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadCompanies() }, [loadCompanies])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [companies, search])

  const activeCount = companies.filter(c => c.active).length
  const totalBranches = companies.reduce((acc, c) => acc + (c.branches?.length ?? 0), 0)

  async function handleToggleActive(c: Company) {
    setToggling(c.id)
    const supabase = createClient()
    const { error } = await supabase
      .from('companies')
      .update({ active: !c.active })
      .eq('id', c.id)
    if (!error) {
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x))
    }
    setToggling(null)
  }

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(c: Company) {
    setEditing(c)
    setModalOpen(true)
  }

  function handleSaved() {
    setModalOpen(false)
    setEditing(null)
    loadCompanies()
  }

  // Пока профиль не загружен — показываем заглушку загрузки
  if (!profileLoaded) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
  }

  // Доступ только для super_admin / owner
  if (!canManage) {
    return (
      <Panel>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Доступ ограничен</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Раздел «Рестораны» доступен только владельцам и супер-администраторам.
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Всего ресторанов" value={loading ? '…' : companies.length} sub="Подключено к платформе" accent="mint" icon="🏪" />
        <KpiCard label="Активных" value={loading ? '…' : activeCount} sub={`Неактивных: ${companies.length - activeCount}`} accent="blue" icon="✅" />
        <KpiCard label="Филиалов всего" value={loading ? '…' : totalBranches} sub="По всем ресторанам" accent="purple" icon="📍" />
      </div>

      {/* Топбар: поиск + добавить */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или slug…"
          style={{ ...inputStyle(), width: 280 }}
        />
        {canEdit && (
          <PrimaryButton onClick={openCreate}>
            <span style={{ fontSize: 14 }}>+</span> Добавить ресторан
          </PrimaryButton>
        )}
      </div>

      {/* Список ресторанов */}
      <Panel title="Рестораны" sub={`${filtered.length} из ${companies.length}`}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            {companies.length === 0 ? 'Пока нет ни одного ресторана' : 'Ничего не найдено'}
          </div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 4px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Логотип */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: c.logo_url ? `url(${c.logo_url}) center/cover` : 'linear-gradient(135deg, #1A2140, #0D1528)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                {!c.logo_url && '🏪'}
              </div>

              {/* Инфо */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                    background: c.active ? 'var(--mint-dim)' : 'rgba(239,68,68,0.12)',
                    color: c.active ? 'var(--mint)' : 'var(--danger)',
                  }}>
                    {c.active ? 'Активен' : 'Отключен'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  /{c.slug} · {c.branches?.length ?? 0} филиал{(c.branches?.length ?? 0) === 1 ? '' : (c.branches?.length ?? 0) >= 2 && (c.branches?.length ?? 0) <= 4 ? 'а' : 'ов'}
                </div>
              </div>

              {/* Действия — только Super Admin */}
              {canEdit && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Toggle
                    checked={c.active}
                    disabled={toggling === c.id}
                    onChange={() => handleToggleActive(c)}
                  />
                  <GhostButton onClick={() => openEdit(c)}>Редактировать</GhostButton>
                </div>
              )}
            </div>
          ))
        )}
      </Panel>

      {modalOpen && (
        <CompanyModal
          company={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
