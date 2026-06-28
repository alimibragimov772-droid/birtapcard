'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Типы ───────────────────────────────────────────────────────────────────

type UserProfile = {
  user_id: string
  role: string | null
  company_id: string | null
  branch_id: string | null
}

type ScanEvent = {
  id: string
  branch_id: string
  scan_type: string
  device: string
  is_unique: boolean
  scanned_at: string
  branches?: { name: string; companies?: { name: string } | null } | null
}

type BranchOption = { id: string; name: string; company: string }
type HourPoint = { hour: string; nfc: number; qr: number }
type WeekdayPoint = { day: string; nfc: number; qr: number }
type BranchRow = {
  id: string
  name: string
  company: string
  nfc: number
  qr: number
  total: number
  unique: number
  conversion: number
}
type SortKey = 'total' | 'nfc' | 'qr' | 'unique' | 'conversion'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// ─── Вспомогательные компоненты (стиль идентичен дашборду) ──────────────────

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
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--card2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-dim)' }}>{p.name === 'nfc' ? 'NFC' : 'QR'}:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function selectStyle(): React.CSSProperties {
  return {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '7px 12px', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit',
    cursor: 'pointer', outline: 'none',
  }
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('7')
  const [customFrom, setCustomFrom] = useState<string>(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [events, setEvents] = useState<ScanEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')

  // Загрузка профиля для фильтрации данных по роли
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setProfileLoaded(true); return }
      const { data } = await supabase
        .from('profiles')
        .select('user_id, role, company_id, branch_id')
        .eq('user_id', user.id)
        .single()
      setProfile(data as UserProfile | null)
      setProfileLoaded(true)
    })
  }, [])

  // Список филиалов для фильтра (зависит от RLS — видны только доступные)
  useEffect(() => {
    if (!profileLoaded) return
    const supabase = createClient()
    supabase
      .from('branches')
      .select('id, name, companies(name)')
      .order('name')
      .then(({ data }) => {
        const list = ((data as { id: string; name: string; companies?: { name: string } | null }[] | null) ?? [])
          .map(b => ({ id: b.id, name: b.name, company: b.companies?.name ?? '—' }))
        setBranches(list)
      })
  }, [profileLoaded])

  // Границы периода
  const { since, until, daysCount } = useMemo(() => {
    if (range === 'custom') {
      const fromD = new Date(customFrom + 'T00:00:00')
      const toD = new Date(customTo + 'T23:59:59')
      const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1)
      return { since: fromD.toISOString(), until: toD.toISOString(), daysCount: days }
    }
    const days = parseInt(range)
    return {
      since: new Date(Date.now() - days * 86400000).toISOString(),
      until: new Date().toISOString(),
      daysCount: days,
    }
  }, [range, customFrom, customTo])

  const loadData = useCallback(async () => {
    if (!profileLoaded || !profile) return
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('scan_events')
      .select('id, branch_id, scan_type, device, is_unique, scanned_at, branches(name, companies(name))')
      .gte('scanned_at', since)
      .lte('scanned_at', until)
      .order('scanned_at', { ascending: false })
      .limit(5000)

    // Роль-based фильтрация: branch_manager видит только свой филиал
    if (profile.role === 'branch_manager' && profile.branch_id) {
      query = query.eq('branch_id', profile.branch_id)
    } else if (branchFilter !== 'all') {
      query = query.eq('branch_id', branchFilter)
    }

    const { data } = await query
    setEvents((data as ScanEvent[] | null) ?? [])
    setLoading(false)
  }, [since, until, branchFilter, profile, profileLoaded])

  useEffect(() => {
    if (profileLoaded) loadData()
  }, [loadData, profileLoaded])

  // ── KPI ──────────────────────────────────────────────────────────────────
  const totalScans = events.length
  const nfcTotal = events.filter(e => e.scan_type === 'nfc').length
  const qrTotal = events.filter(e => e.scan_type === 'qr').length
  const uniqueTotal = events.filter(e => e.is_unique).length
  const avgPerDay = daysCount > 0 ? Math.round((totalScans / daysCount) * 10) / 10 : 0
  const repeatRate = totalScans > 0 ? Math.round(((totalScans - uniqueTotal) / totalScans) * 100) : 0

  // ── Почасовое распределение ─────────────────────────────────────────────
  const hourlyData: HourPoint[] = useMemo(() => {
    const buckets: { nfc: number; qr: number }[] = Array.from({ length: 24 }, () => ({ nfc: 0, qr: 0 }))
    events.forEach(e => {
      const h = new Date(e.scanned_at).getHours()
      if (e.scan_type === 'nfc') buckets[h].nfc++
      else buckets[h].qr++
    })
    return buckets.map((v, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, nfc: v.nfc, qr: v.qr }))
  }, [events])

  // ── Распределение по дням недели ────────────────────────────────────────
  const weekdayData: WeekdayPoint[] = useMemo(() => {
    const buckets: { nfc: number; qr: number }[] = Array.from({ length: 7 }, () => ({ nfc: 0, qr: 0 }))
    events.forEach(e => {
      const jsDay = new Date(e.scanned_at).getDay() // 0=Вс..6=Сб
      const idx = jsDay === 0 ? 6 : jsDay - 1 // 0=Пн..6=Вс
      if (e.scan_type === 'nfc') buckets[idx].nfc++
      else buckets[idx].qr++
    })
    return buckets.map((v, i) => ({ day: WEEKDAYS[i], nfc: v.nfc, qr: v.qr }))
  }, [events])

  // ── Таблица по филиалам ──────────────────────────────────────────────────
  const branchRows: BranchRow[] = useMemo(() => {
    const map: Record<string, BranchRow> = {}
    events.forEach(e => {
      const id = e.branch_id
      if (!map[id]) {
        map[id] = {
          id,
          name: e.branches?.name ?? '—',
          company: e.branches?.companies?.name ?? '—',
          nfc: 0, qr: 0, total: 0, unique: 0, conversion: 0,
        }
      }
      const row = map[id]
      if (e.scan_type === 'nfc') row.nfc++
      else row.qr++
      row.total++
      if (e.is_unique) row.unique++
    })
    const rows = Object.values(map).map(r => ({
      ...r,
      conversion: r.total > 0 ? Math.round((r.unique / r.total) * 100) : 0,
    }))
    return rows.sort((a, b) => b[sortKey] - a[sortKey])
  }, [events, sortKey])

  function exportCsv() {
    const header = 'Филиал,Ресторан,NFC,QR,Всего,Уникальных,Конверсия %\n'
    const body = branchRows
      .map(r => `"${r.name}","${r.company}",${r.nfc},${r.qr},${r.total},${r.unique},${r.conversion}`)
      .join('\n')
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `birtapcard-analytics-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sortLabels: Record<SortKey, string> = {
    total: 'Всего', nfc: 'NFC', qr: 'QR', unique: 'Уникальных', conversion: 'Конверсия',
  }

  if (!profileLoaded) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
  }

  // Branch manager не может менять фильтр филиала — он жёстко привязан к одному
  const isBranchManager = profile?.role === 'branch_manager'

  return (
    <div>
      {/* Фильтры */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--card)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          {(['7', '30', '90', 'custom'] as const).map(t => (
            <button key={t}
              onClick={() => setRange(t)}
              style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: range === t ? 'var(--bg2)' : 'transparent',
                color: range === t ? 'var(--text)' : 'var(--text-muted)',
                transition: 'all 0.18s',
              }}
            >
              {t === '7' ? '7 дней' : t === '30' ? '30 дней' : t === '90' ? '90 дней' : 'Период'}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={customFrom} max={customTo}
              onChange={e => setCustomFrom(e.target.value)} style={selectStyle()} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
            <input type="date" value={customTo} min={customFrom} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setCustomTo(e.target.value)} style={selectStyle()} />
          </div>
        )}

        {!isBranchManager && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={selectStyle()}>
            <option value="all">Все филиалы</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.company} — {b.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={exportCsv}
          disabled={branchRows.length === 0}
          style={{
            marginLeft: 'auto',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '7px 14px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: branchRows.length === 0 ? 'var(--text-muted)' : 'var(--mint)',
            cursor: branchRows.length === 0 ? 'default' : 'pointer',
          }}
        >
          ⬇ Экспорт CSV
        </button>
      </div>

      {/* KPI карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Всего сканирований" value={loading ? '…' : totalScans} sub={`За выбранный период · ${daysCount} дн.`} accent="mint" icon="📈" />
        <KpiCard label="Уникальных посетителей" value={loading ? '…' : uniqueTotal} sub={totalScans > 0 ? `${Math.round((uniqueTotal / totalScans) * 100)}% от всех сканов` : 'Нет данных'} accent="orange" icon="👤" />
        <KpiCard label="Ср. сканирований/день" value={loading ? '…' : avgPerDay} sub={`NFC: ${nfcTotal} · QR: ${qrTotal}`} accent="blue" icon="📅" />
        <KpiCard label="Повторных визитов" value={loading ? '…' : `${repeatRate}%`} sub="Те же устройства повторно" accent="purple" icon="🔁" />
      </div>

      {/* Почасовое + по дням недели */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Panel title="Почасовое распределение" sub="Когда чаще всего сканируют">
          {loading ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Загрузка…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
                <Bar dataKey="nfc" stackId="a" fill="var(--mint)" radius={[0, 0, 0, 0]} name="nfc" />
                <Bar dataKey="qr" stackId="a" fill="var(--orange)" radius={[3, 3, 0, 0]} name="qr" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="По дням недели" sub="Понедельник — воскресенье">
          {loading ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Загрузка…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
                <Bar dataKey="nfc" stackId="a" fill="var(--mint)" name="nfc" />
                <Bar dataKey="qr" stackId="a" fill="var(--orange)" radius={[3, 3, 0, 0]} name="qr" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            {[{ color: 'var(--mint)', label: 'NFC' }, { color: 'var(--orange)', label: 'QR' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Таблица по филиалам */}
      <Panel title="Сравнение филиалов" sub="Сортировка по клику на колонку">
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Загрузка…</div>
        ) : branchRows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Нет данных за выбранный период</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>Филиал</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>Ресторан</th>
                  {(['nfc', 'qr', 'total', 'unique', 'conversion'] as SortKey[]).map(key => (
                    <th key={key}
                      onClick={() => setSortKey(key)}
                      style={{
                        textAlign: 'right', padding: '8px 12px', cursor: 'pointer', userSelect: 'none',
                        color: sortKey === key ? 'var(--mint)' : 'var(--text-muted)',
                        fontWeight: 500, fontSize: 11, textTransform: 'uppercase',
                      }}>
                      {sortLabels[key]}{sortKey === key ? ' ↓' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branchRows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.company}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.nfc}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.qr}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.total}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.unique}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mint)' }}>{r.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
