'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'

// ─── Конфигурация ───────────────────────────────────────────────────────────

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const QR_BUCKET = 'qr-codes'

// ─── Типы ───────────────────────────────────────────────────────────────────

type CompanyOption = { id: string; name: string; active: boolean }

type Branch = {
  id: string
  company_id: string
  name: string
  slug: string
  google_url: string
  nfc_token: string
  qr_token: string
  nfc_url: string
  qr_url: string
  qr_image_url: string | null
  active: boolean
  created_at: string
  companies?: { name: string; slug: string } | null
}

type Profile = { role: string | null; user_id: string }

// ─── Вспомогательные компоненты (стиль идентичен companies/dashboard/analytics) ──

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

function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6,
        display: 'block', textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{hint}</div>}
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

// Короткое поле "значение + копировать" для ссылок и токенов
function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
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
        fontFamily: mono ? 'var(--font-mono), JetBrains Mono, monospace' : 'inherit',
        fontSize: 11.5, color: 'var(--text-dim)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      <button
        onClick={handleCopy}
        title="Скопировать"
        style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
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

// Генерация PNG QR-кода в браузере и загрузка через API-роут (обходит RLS)
async function generateAndUploadQr(
  _supabase: unknown,
  branchId: string,
  qrUrl: string
): Promise<string> {
  const imageBase64 = await QRCode.toDataURL(qrUrl, {
    width: 512,
    margin: 2,
    color: { dark: '#070C1A', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })

  const res = await fetch('/api/branches/qr-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchId, imageBase64 }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Ошибка загрузки QR-кода')
  }

  const { publicUrl } = await res.json()
  return publicUrl
}

// ─── Модальное окно создания/редактирования филиала ─────────────────────────

function BranchModal({
  branch, companies, defaultCompanyId, onClose, onSaved,
}: {
  branch: Branch | null
  companies: CompanyOption[]
  defaultCompanyId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!branch
  const [companyId, setCompanyId] = useState(branch?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? '')
  const [name, setName] = useState(branch?.name ?? '')
  const [slug, setSlug] = useState(branch?.slug ?? '')
  const [googleUrl, setGoogleUrl] = useState(branch?.google_url ?? '')
  const [active, setActive] = useState(branch?.active ?? true)
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string>('') // текст текущего шага сохранения (для длинной операции с QR)

  function handleNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  async function handleSave() {
    if (!companyId) { setError('Выберите ресторан'); return }
    if (!name.trim()) { setError('Введите название филиала'); return }
    if (!slug.trim()) { setError('Введите slug'); return }
    if (!googleUrl.trim()) { setError('Укажите ссылку на отзывы Google'); return }

    setSaving(true)
    setError(null)

    try {
      if (isEdit) {
        setStep('Сохраняем изменения…')
        const updRes = await fetch('/api/branches/manage', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: branch!.id,
            company_id: companyId,
            name: name.trim(),
            slug: slug.trim(),
            google_url: googleUrl.trim(),
            active,
          }),
        })
        if (!updRes.ok) {
          const err = await updRes.json().catch(() => ({}))
          throw new Error(err.error || 'Не удалось обновить филиал')
        }
      } else {
        setStep('Создаём филиал и токены…')
        const nfcToken = crypto.randomUUID()
        const qrToken = crypto.randomUUID()
        const nfcUrl = `${SITE_URL}/r/nfc/${nfcToken}`
        const qrUrl = `${SITE_URL}/r/qr/${qrToken}`

        // Создаём через API-роут (обходит RLS через Service Role)
        const createRes = await fetch('/api/branches/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyId,
            name: name.trim(),
            slug: slug.trim(),
            google_url: googleUrl.trim(),
            nfc_token: nfcToken,
            qr_token: qrToken,
            active,
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}))
          throw new Error(err.error || 'Не удалось создать филиал')
        }
        const inserted = await createRes.json()

        setStep('Генерируем QR-код…')
        const publicUrl = await generateAndUploadQr(null, inserted.id, qrUrl)

        setStep('Сохраняем QR-код…')
        const patchRes = await fetch('/api/branches/manage', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inserted.id, qr_image_url: publicUrl }),
        })
        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}))
          throw new Error(err.error || 'Не удалось сохранить QR-код')
        }
      }

      setSaving(false)
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось сохранить филиал'
      setError(msg)
      setSaving(false)
      setStep('')
    }
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
          <span>{isEdit ? '✏️ Редактировать филиал' : '➕ Новый филиал'}</span>
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

        <FormField label="Ресторан">
          <select
            style={inputStyle()}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            {companies.length === 0 && <option value="">Нет ресторанов</option>}
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{!c.active ? ' (отключен)' : ''}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Название филиала">
          <input
            style={inputStyle()}
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Grand Registan — Чорсу"
            autoFocus
          />
        </FormField>

        <FormField label="Slug (используется в ссылках)">
          <input
            style={inputStyle()}
            value={slug}
            onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
            placeholder="chorsu"
          />
        </FormField>

        <FormField
          label="Ссылка на отзывы Google"
          hint="После сканирования NFC/QR клиент будет редиректнут именно сюда."
        >
          <input
            style={inputStyle()}
            value={googleUrl}
            onChange={e => setGoogleUrl(e.target.value)}
            placeholder="https://g.page/r/.../review"
          />
        </FormField>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '4px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Филиал активен</span>
          <Toggle checked={active} onChange={() => setActive(v => !v)} />
        </div>

        {!isEdit && (
          <div style={{
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', marginBottom: 16,
          }}>
            При создании автоматически будут сгенерированы NFC- и QR-токены и QR-код для печати.
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          {saving && step && (
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginRight: 'auto' }}>{step}</span>
          )}
          <GhostButton onClick={onClose} disabled={saving}>Отмена</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={saving || companies.length === 0}>
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ─── Модалка просмотра QR-кода (увеличенно + скачать) ───────────────────────

function QrPreviewModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
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
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 16 }}>QR-код для печати на табличке</div>

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

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
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
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function BranchesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [qrPreview, setQrPreview] = useState<Branch | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

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

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [companiesRes, branchesRes] = await Promise.all([
      supabase.from('companies').select('id, name, active').order('name'),
      supabase
        .from('branches')
        .select('id, company_id, name, slug, google_url, nfc_token, qr_token, nfc_url, qr_url, qr_image_url, active, created_at, companies(name, slug)')
        .order('created_at', { ascending: false }),
    ])

    setCompanies((companiesRes.data as CompanyOption[] | null) ?? [])
    setBranches((branchesRes.data as unknown as Branch[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (canManage) loadData() }, [canManage, loadData])

  const filtered = useMemo(() => {
    let list = branches
    if (companyFilter !== 'all') list = list.filter(b => b.company_id === companyFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.companies?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [branches, companyFilter, search])

  const activeCount = branches.filter(b => b.active).length
  const withoutQrCount = branches.filter(b => !b.qr_image_url).length

  async function handleToggleActive(b: Branch) {
    setToggling(b.id)
    const res = await fetch('/api/branches/manage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, active: !b.active }),
    })
    if (res.ok) {
      setBranches(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x))
    } else {
      const err = await res.json().catch(() => ({}))
      setRowError(err.error || 'Ошибка обновления')
    }
    setToggling(null)
  }

  async function handleRegenerateQr(b: Branch) {
    setRegenerating(b.id)
    setRowError(null)
    try {
      const publicUrl = await generateAndUploadQr(null, b.id, b.qr_url)
      const patchRes = await fetch('/api/branches/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, qr_image_url: publicUrl }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error(err.error || 'Не удалось сохранить QR')
      }
      setBranches(prev => prev.map(x => x.id === b.id ? { ...x, qr_image_url: publicUrl } : x))
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Не удалось перегенерировать QR-код')
    }
    setRegenerating(null)
  }

  async function handleDelete(b: Branch) {
    const ok = window.confirm(
      `Удалить филиал «${b.name}»?\n\nNFC-табличка и QR-код перестанут работать. История сканирований сохранится в базе. Это действие нельзя отменить.`
    )
    if (!ok) return

    setDeleting(b.id)
    setRowError(null)
    try {
      const delRes = await fetch('/api/branches/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id }),
      })
      if (!delRes.ok) {
        const err = await delRes.json().catch(() => ({}))
        throw new Error(err.error || 'Не удалось удалить филиал')
      }
      setBranches(prev => prev.filter(x => x.id !== b.id))
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Не удалось удалить филиал')
    }
    setDeleting(null)
  }

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(b: Branch) {
    setEditing(b)
    setModalOpen(true)
  }

  function handleSaved() {
    setModalOpen(false)
    setEditing(null)
    loadData()
  }

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
            Раздел «Филиалы» доступен только владельцам и супер-администраторам.
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Всего филиалов" value={loading ? '…' : branches.length} sub="По всем ресторанам" accent="mint" icon="📍" />
        <KpiCard label="Активных" value={loading ? '…' : activeCount} sub={`Неактивных: ${branches.length - activeCount}`} accent="blue" icon="✅" />
        <KpiCard label="Без QR-кода" value={loading ? '…' : withoutQrCount} sub="Требуют генерации" accent="orange" icon="⬛" />
      </div>

      {/* Топбар: фильтры + добавить */}
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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или slug…"
          style={{ ...inputStyle(), width: 260 }}
        />
        <div style={{ marginLeft: 'auto' }}>
          {canEdit && (
            <PrimaryButton onClick={openCreate} disabled={companies.length === 0}>
              <span style={{ fontSize: 14 }}>+</span> Добавить филиал
            </PrimaryButton>
          )}
        </div>
      </div>

      {companies.length === 0 && !loading && (
        <div style={{
          background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.25)',
          borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 16,
        }}>
          Сначала добавьте хотя бы один ресторан в разделе «Рестораны» — филиал привязывается к ресторану.
        </div>
      )}

      {rowError && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: 'var(--danger)', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{rowError}</span>
          <button onClick={() => setRowError(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Список филиалов */}
      <Panel title="Филиалы" sub={`${filtered.length} из ${branches.length}`}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            {branches.length === 0 ? 'Пока нет ни одного филиала' : 'Ничего не найдено'}
          </div>
        ) : (
          filtered.map((b, i) => (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 200px 200px auto',
                alignItems: 'center', gap: 14,
                padding: '14px 4px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* QR-миниатюра */}
              <button
                onClick={() => setQrPreview(b)}
                title="Показать QR-код"
                style={{
                  width: 44, height: 44, borderRadius: 9, flexShrink: 0, padding: 4,
                  background: '#fff', border: '1px solid var(--border)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                {b.qr_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.qr_image_url} alt="QR" width={36} height={36} style={{ display: 'block' }} />
                ) : (
                  <span style={{ fontSize: 16 }}>⬛</span>
                )}
              </button>

              {/* Инфо */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{b.name}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                    background: b.active ? 'var(--mint-dim)' : 'rgba(239,68,68,0.12)',
                    color: b.active ? 'var(--mint)' : 'var(--danger)',
                  }}>
                    {b.active ? 'Активен' : 'Отключен'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  🏪 {b.companies?.name ?? '—'} · /{b.slug}
                </div>
              </div>

              {/* NFC ссылка */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>NFC-ссылка</div>
                <CopyField value={b.nfc_url} />
              </div>

              {/* QR ссылка */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>QR-ссылка</div>
                <CopyField value={b.qr_url} />
              </div>

              {/* Действия */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'end' }}>
                {canEdit && <Toggle checked={b.active} disabled={toggling === b.id} onChange={() => handleToggleActive(b)} />}
                {canEdit && (
                  <GhostButton onClick={() => handleRegenerateQr(b)} disabled={regenerating === b.id}>
                    {regenerating === b.id ? '…' : '↻ QR'}
                  </GhostButton>
                )}
                {canEdit && <GhostButton onClick={() => openEdit(b)}>Редактировать</GhostButton>}
                {canEdit && (
                  <GhostButton danger onClick={() => handleDelete(b)} disabled={deleting === b.id}>
                    {deleting === b.id ? '…' : 'Удалить'}
                  </GhostButton>
                )}
              </div>
            </div>
          ))
        )}
      </Panel>

      {modalOpen && (
        <BranchModal
          branch={editing}
          companies={companies}
          defaultCompanyId={companyFilter !== 'all' ? companyFilter : null}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}

      {qrPreview && (
        <QrPreviewModal branch={qrPreview} onClose={() => setQrPreview(null)} />
      )}
    </div>
  )
}
