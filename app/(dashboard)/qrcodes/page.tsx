'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Типы ───────────────────────────────────────────────────────────────────

type CompanyOption = { id: string; name: string; active: boolean }

type BranchRow = {
  id: string
  company_id: string
  name: string
  slug: string
  qr_url: string
  qr_image_url: string | null
  active: boolean
  created_at: string
  companies?: { name: string; slug: string } | null
}

type Profile = { role: string | null; user_id: string }

// ─── Вспомогательные компоненты (стиль идентичен dashboard/analytics/companies/branches) ──

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

// Короткое поле "значение + копировать" для QR-ссылки
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // буфер обмена недоступен — молча игнорируем
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, minWidth: 0, padding: '7px 10px', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 7,
        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
        fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      <button
        onClick={handleCopy}
        title="Скопировать"
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
          background: copied ? 'var(--mint-dim)' : 'var(--card2)',
          border: '1px solid var(--border)', color: copied ? 'var(--mint)' : 'var(--text-muted)',
          fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.18s',
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  )
}

// ─── Карточка QR-кода одного филиала ─────────────────────────────────────────

function QrCard({ branch, onPreview }: { branch: BranchRow; onPreview: () => void }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      transition: 'border-color 0.18s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--mint)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <button
        onClick={onPreview}
        title="Показать QR-код"
        style={{
          width: '100%', aspectRatio: '1 / 1', borderRadius: 10, padding: 14,
          background: '#fff', border: '1px solid var(--border)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {branch.qr_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branch.qr_image_url} alt={`QR-код ${branch.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 28, color: '#999' }}>⬛</span>
        )}
      </button>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {branch.name}
          </span>
          <span style={{
            flexShrink: 0,
            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: branch.active ? 'var(--mint-dim)' : 'rgba(239,68,68,0.12)',
            color: branch.active ? 'var(--mint)' : 'var(--danger)',
          }}>
            {branch.active ? 'Активен' : 'Отключен'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🏪 {branch.companies?.name ?? '—'} · /{branch.slug}
        </div>
      </div>

      <CopyField value={branch.qr_url} />

      <div style={{ display: 'flex', gap: 8 }}>
        <GhostButton onClick={onPreview}>👁 Просмотр</GhostButton>
        {branch.qr_image_url ? (
          <a
            href={branch.qr_image_url}
            download={`qr-${branch.slug}.png`}
            style={{ flex: 1, textDecoration: 'none' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--mint)', color: 'var(--bg)', cursor: 'pointer',
            }}>
              ⬇ PNG
            </div>
          </a>
        ) : (
          <div style={{ flex: 1 }}>
            <GhostButton disabled>⬇ PNG</GhostButton>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Модалка увеличенного просмотра QR-кода ──────────────────────────────────

function QrPreviewModal({ branch, onClose }: { branch: BranchRow; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
          padding: 24, width: 340, maxWidth: '95vw', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{branch.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 16 }}>
          🏪 {branch.companies?.name ?? '—'} · /{branch.slug}
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, padding: 16, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {branch.qr_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branch.qr_image_url} alt={`QR-код ${branch.name}`} width={260} height={260} style={{ display: 'block' }} />
          ) : (
            <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>
              QR-код не сгенерирован
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <CopyField value={branch.qr_url} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <GhostButton onClick={onClose}>Закрыть</GhostButton>
          {branch.qr_image_url && (
            <a
              href={branch.qr_image_url}
              download={`qr-${branch.slug}.png`}
              style={{ flex: 1, textDecoration: 'none' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'var(--mint)', color: 'var(--bg)', cursor: 'pointer',
              }}>
                ⬇ Скачать PNG
              </div>
            </a>
          )}
        </div>

        {!branch.qr_image_url && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Сгенерировать QR-код можно в разделе «Филиалы» → кнопка «↻ QR».
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function QrCodesPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'missing'>('all')
  const [preview, setPreview] = useState<BranchRow | null>(null)

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
      if (!data || data.role !== 'super_admin') {
        router.replace('/dashboard')
      }
  }, [])

  const canManage = profile?.role === 'super_admin'

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [companiesRes, branchesRes] = await Promise.all([
      supabase.from('companies').select('id, name, active').order('name'),
      supabase
        .from('branches')
        .select('id, company_id, name, slug, qr_url, qr_image_url, active, created_at, companies(name, slug)')
        .order('created_at', { ascending: false }),
    ])

    setCompanies((companiesRes.data as CompanyOption[] | null) ?? [])
    setBranches((branchesRes.data as unknown as BranchRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (canManage) loadData() }, [canManage, loadData])

  const filtered = useMemo(() => {
    let list = branches
    if (companyFilter !== 'all') list = list.filter(b => b.company_id === companyFilter)
    if (statusFilter === 'active') list = list.filter(b => b.active)
    if (statusFilter === 'inactive') list = list.filter(b => !b.active)
    if (statusFilter === 'missing') list = list.filter(b => !b.qr_image_url)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.companies?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [branches, companyFilter, statusFilter, search])

  const withQrCount = branches.filter(b => !!b.qr_image_url).length
  const withoutQrCount = branches.length - withQrCount
  const activeCount = branches.filter(b => b.active).length

  if (!profileLoaded) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
  }

  if (!canManage) {
    return (
      <Panel>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Доступ ограничен</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Раздел «QR-коды» доступен только владельцам и супер-администраторам.
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Всего QR-кодов" value={loading ? '…' : branches.length} sub="По всем филиалам" accent="mint" icon="▦" />
        <KpiCard label="Сгенерировано" value={loading ? '…' : withQrCount} sub={`Активных: ${activeCount}`} accent="blue" icon="✅" />
        <KpiCard label="Не сгенерировано" value={loading ? '…' : withoutQrCount} sub="См. раздел «Филиалы»" accent="orange" icon="⬛" />
      </div>

      {/* Топбар: фильтры */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          style={{ ...inputStyle(), width: 220 }}
        >
          <option value="all">Все рестораны</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ ...inputStyle(), width: 180 }}
        >
          <option value="all">Все статусы</option>
          <option value="active">Только активные</option>
          <option value="inactive">Только отключенные</option>
          <option value="missing">Без QR-кода</option>
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или slug…"
          style={{ ...inputStyle(), width: 260 }}
        />
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
          {filtered.length} из {branches.length}
        </div>
      </div>

      {branches.length === 0 && !loading && (
        <div style={{
          background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.25)',
          borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 16,
        }}>
          Пока нет ни одного филиала. Добавьте филиал в разделе «Филиалы» — QR-код сгенерируется автоматически.
        </div>
      )}

      {/* Сетка QR-кодов */}
      <Panel title="QR-коды филиалов" sub="Просмотр и скачивание PNG для печати на табличках">
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Ничего не найдено
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {filtered.map(b => (
              <QrCard key={b.id} branch={b} onPreview={() => setPreview(b)} />
            ))}
          </div>
        )}
      </Panel>

      {preview && (
        <QrPreviewModal branch={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
