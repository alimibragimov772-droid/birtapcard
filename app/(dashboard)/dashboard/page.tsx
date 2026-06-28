'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
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
  browser_lang: string
  is_unique: boolean
  scanned_at: string
  branches?: { name: string; companies?: { name: string } | null } | null
}

type DayPoint = { day: string; nfc: number; qr: number; total: number }
type DevicePoint = { name: string; value: number; color: string }
type LangPoint = { name: string; value: number; color: string }
type BranchStat = { name: string; company: string; scans: number }

// ─── Вспомогательные компоненты ─────────────────────────────────────────────

function KpiCard({
  label, value, delta, deltaUp, accent, icon,
}: {
  label: string; value: string | number; delta: string
  deltaUp: boolean; accent: 'mint' | 'orange' | 'blue' | 'purple'; icon: string
}) {
  const colors = {
    mint:   { val: 'var(--mint)',   dim: 'var(--mint-dim)',               bar: 'linear-gradient(90deg, var(--mint), transparent)' },
    orange: { val: 'var(--orange)', dim: 'var(--orange-dim)',             bar: 'linear-gradient(90deg, var(--orange), transparent)' },
    blue:   { val: 'var(--blue)',   dim: 'rgba(59,130,246,0.12)',         bar: 'linear-gradient(90deg, var(--blue), transparent)' },
    purple: { val: 'var(--purple)', dim: 'rgba(139,92,246,0.12)',         bar: 'linear-gradient(90deg, var(--purple), transparent)' },
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
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: c.bar,
      }} />
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
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: deltaUp ? 'var(--success)' : 'var(--danger)' }}>
          {deltaUp ? '↑' : '↓'} {delta}
        </span>
        <span>vs вчера</span>
      </div>
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

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [events, setEvents] = useState<ScanEvent[]>([])
  const [dayData, setDayData] = useState<DayPoint[]>([])
  const [deviceData, setDeviceData] = useState<DevicePoint[]>([])
  const [langData, setLangData] = useState<LangPoint[]>([])
  const [topBranches, setTopBranches] = useState<BranchStat[]>([])
  const [loading, setLoading] = useState(true)
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [tab, setTab] = useState<'7' | '30' | '90'>('7')

  // Загрузка профиля
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

  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const todayNfc    = events.filter(e => e.scanned_at.startsWith(todayStr) && e.scan_type === 'nfc').length
  const todayQr     = events.filter(e => e.scanned_at.startsWith(todayStr) && e.scan_type === 'qr').length
  const todayUniq   = events.filter(e => e.scanned_at.startsWith(todayStr) && e.is_unique).length
  const todayTotal  = todayNfc + todayQr
  const conversion  = todayTotal > 0 ? Math.round((todayUniq / todayTotal) * 100) : 0
  const yestNfc     = events.filter(e => e.scanned_at.startsWith(yesterdayStr) && e.scan_type === 'nfc').length
  const yestQr      = events.filter(e => e.scanned_at.startsWith(yesterdayStr) && e.scan_type === 'qr').length
  const yestUniq    = events.filter(e => e.scanned_at.startsWith(yesterdayStr) && e.is_unique).length

  const loadData = useCallback(async () => {
    if (!profileLoaded || !profile) return
    setLoading(true)
    const supabase = createClient()
    const days = parseInt(tab)
    const since = new Date(Date.now() - days * 86400000).toISOString()

    // Строим запрос с фильтрацией по роли
    let query = supabase
      .from('scan_events')
      .select('id, branch_id, scan_type, device, browser_lang, is_unique, scanned_at, branches(name, companies(name))')
      .gte('scanned_at', since)
      .order('scanned_at', { ascending: false })
      .limit(500)

    if (profile.role === 'branch_manager' && profile.branch_id) {
      // Branch manager видит только свой филиал
      query = query.eq('branch_id', profile.branch_id)
    } else if (profile.role === 'owner' && profile.company_id) {
      // Owner видит все филиалы своей компании (RLS дополнительно защищает на уровне БД)
      const { data: branchIds } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', profile.company_id)
      const ids = (branchIds ?? []).map((b: { id: string }) => b.id)
      if (ids.length > 0) {
        query = query.in('branch_id', ids)
      } else {
        // Нет филиалов — возвращаем пустые данные
        setEvents([])
        setDayData([])
        setDeviceData([])
        setLangData([])
        setTopBranches([])
        setLoading(false)
        return
      }
    }
    // super_admin — без фильтра, видит всё

    const { data: rawEvents } = await query
    const ev: ScanEvent[] = (rawEvents as ScanEvent[] | null) ?? []
    setEvents(ev)

    // По дням
    const byDay: Record<string, { nfc: number; qr: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      byDay[d] = { nfc: 0, qr: 0 }
    }
    ev.forEach(e => {
      const d = e.scanned_at.slice(0, 10)
      if (byDay[d]) {
        if (e.scan_type === 'nfc') byDay[d].nfc++
        else byDay[d].qr++
      }
    })
    setDayData(Object.entries(byDay).map(([day, v]) => ({
      day: day.slice(5),
      nfc: v.nfc, qr: v.qr, total: v.nfc + v.qr,
    })))

    // Устройства
    const devCount: Record<string, number> = {}
    ev.forEach(e => { devCount[e.device] = (devCount[e.device] ?? 0) + 1 })
    const devColors: Record<string, string> = {
      mobile:  'var(--mint)',
      desktop: 'var(--blue)',
      tablet:  'var(--orange)',
      unknown: 'var(--text-muted)',
    }
    const devLabels: Record<string, string> = {
      mobile: 'Мобильный', desktop: 'Десктоп', tablet: 'Планшет', unknown: 'Неизвестно'
    }
    setDeviceData(
      Object.entries(devCount)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ name: devLabels[k] ?? k, value: v, color: devColors[k] ?? 'var(--purple)' }))
    )

    // Языки
    const langCount: Record<string, number> = {}
    ev.forEach(e => {
      const l = (e.browser_lang ?? 'unknown').split('-')[0].toLowerCase()
      langCount[l] = (langCount[l] ?? 0) + 1
    })
    const langColors = ['var(--purple)', 'var(--blue)', 'var(--orange)', 'var(--mint)', 'var(--text-muted)']
    const langNames: Record<string, string> = { ru: 'Русский', uz: 'Узбекский', en: 'Английский', kk: 'Казахский' }
    setLangData(
      Object.entries(langCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v], i) => ({ name: langNames[k] ?? k.toUpperCase(), value: v, color: langColors[i] }))
    )

    // Топ филиалов
    const branchCount: Record<string, { name: string; company: string; count: number }> = {}
    ev.forEach(e => {
      const id = e.branch_id
      if (!branchCount[id]) {
        const b = e.branches
        branchCount[id] = { name: b?.name ?? '—', company: b?.companies?.name ?? '—', count: 0 }
      }
      branchCount[id].count++
    })
    setTopBranches(
      Object.values(branchCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(v => ({ name: v.name, company: v.company, scans: v.count }))
    )

    setLoading(false)
  }, [tab, profile, profileLoaded])

  useEffect(() => {
    if (profileLoaded) loadData()
  }, [loadData, profileLoaded])

  async function loadAi() {
    setAiLoading(true)
    setAiText(null)
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todayNfc, todayQr, todayUniq, conversion,
          topBranches: topBranches.slice(0, 3),
          totalDays: tab,
        }),
      })
      const json = await res.json()
      setAiText(json.text ?? 'Нет данных для анализа.')
    } catch {
      setAiText('Ошибка при загрузке инсайтов. Попробуйте позже.')
    }
    setAiLoading(false)
  }

  const maxBranch = Math.max(...topBranches.map(b => b.scans), 1)

  if (!profileLoaded) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
  }

  return (
    <div>
      {/* Табы периода */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--card)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {(['7', '30', '90'] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', border: 'none', fontFamily: 'inherit',
              background: tab === t ? 'var(--bg2)' : 'transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              transition: 'all 0.18s',
            }}
          >
            {t === '7' ? '7 дней' : t === '30' ? '30 дней' : '90 дней'}
          </button>
        ))}
      </div>

      {/* KPI карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="NFC сканы" value={loading ? '…' : todayNfc} delta={`${Math.abs(todayNfc - yestNfc)}`} deltaUp={todayNfc >= yestNfc} accent="mint"   icon="📡" />
        <KpiCard label="QR сканы"  value={loading ? '…' : todayQr}  delta={`${Math.abs(todayQr - yestQr)}`}   deltaUp={todayQr >= yestQr}   accent="orange" icon="🔲" />
        <KpiCard label="Уникальных" value={loading ? '…' : todayUniq} delta={`${Math.abs(todayUniq - yestUniq)}`} deltaUp={todayUniq >= yestUniq} accent="blue" icon="👤" />
        <KpiCard label="Конверсия" value={loading ? '…' : `${conversion}%`} delta={`${conversion}%`} deltaUp={conversion >= 50} accent="purple" icon="📈" />
      </div>

      {/* AI-инсайты — только для super_admin и owner */}
      {(profile?.role === 'super_admin' || profile?.role === 'owner') && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,212,170,0.06), rgba(59,130,246,0.06))',
          border: '1px solid rgba(0,212,170,0.2)', borderRadius: 12, padding: 20,
          marginBottom: 16, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120,
            background: 'radial-gradient(circle, rgba(0,212,170,0.1), transparent 70%)',
            pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--mint), var(--blue))',
                color: 'var(--bg)', fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 4, letterSpacing: 0.5,
              }}>✦ AI INSIGHTS</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Анализ за сегодня</span>
            </div>
            <button
              onClick={loadAi}
              disabled={aiLoading}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 12px', fontSize: 12, fontWeight: 600,
                color: aiLoading ? 'var(--text-muted)' : 'var(--mint)',
                cursor: aiLoading ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {aiLoading ? 'Анализирую…' : aiText ? '↺ Обновить' : '✦ Анализировать'}
            </button>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-dim)' }}>
            {aiLoading ? (
              <span style={{ color: 'var(--text-muted)' }}>
                Анализирую данные
                <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
                      background: 'var(--mint)',
                      animation: `btc-blink 1.4s ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </span>
              </span>
            ) : aiText ? (
              <span dangerouslySetInnerHTML={{ __html: aiText.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }} />
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>
                Нажмите «Анализировать» — AI изучит статистику и даст рекомендации по улучшению конверсии.
              </span>
            )}
          </div>
        </div>
      )}

      {/* График + Топ филиалов */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Линейный график */}
        <Panel title="Сканирования по дням" sub={`За последние ${tab} дней`}>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Загрузка…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dayData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="nfc" stroke="var(--mint)"   strokeWidth={2} dot={false} name="nfc" />
                <Line type="monotone" dataKey="qr"  stroke="var(--orange)" strokeWidth={2} dot={false} name="qr" />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            {[{ color: 'var(--mint)', label: 'NFC' }, { color: 'var(--orange)', label: 'QR' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 2, background: l.color, borderRadius: 1, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Топ филиалов */}
        <Panel title="Топ филиалов" sub="По количеству сканов">
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
          ) : topBranches.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Нет данных
            </div>
          ) : (
            topBranches.map((b, i) => (
              <div key={b.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < topBranches.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-muted)', width: 20, textAlign: 'center',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.company}</div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4 }}>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--mint)', width: `${Math.round((b.scans / maxBranch) * 100)}%`, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  fontWeight: 600, color: 'var(--text)', textAlign: 'right', width: 40,
                }}>
                  {b.scans}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Устройства + Языки + Лента событий */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

        {/* Устройства */}
        <Panel title="Устройства">
          {!loading && deviceData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <PieChart width={100} height={100}>
                <Pie data={deviceData} cx={45} cy={45} innerRadius={28} outerRadius={45}
                  dataKey="value" strokeWidth={0}>
                  {deviceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {deviceData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>{d.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
          )}
        </Panel>

        {/* Языки */}
        <Panel title="Языки">
          {!loading && langData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <PieChart width={100} height={100}>
                <Pie data={langData} cx={45} cy={45} innerRadius={28} outerRadius={45}
                  dataKey="value" strokeWidth={0}>
                  {langData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {langData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>{d.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
          )}
        </Panel>

        {/* Лента событий */}
        <Panel title="Последние события">
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
          ) : events.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Нет событий</div>
          ) : (
            events.slice(0, 6).map(e => {
              const t = new Date(e.scanned_at)
              const hm = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              const isNfc = e.scan_type === 'nfc'
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: isNfc ? 'var(--mint)' : 'var(--orange)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>
                      {e.branches?.name ?? '—'}
                      <span style={{
                        marginLeft: 6, display: 'inline-flex', alignItems: 'center',
                        padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
                        background: isNfc ? 'var(--mint-dim)' : 'var(--orange-dim)',
                        color: isNfc ? 'var(--mint)' : 'var(--orange)',
                      }}>
                        {isNfc ? 'NFC' : 'QR'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {e.device} · {e.is_unique ? 'Уникальный' : 'Повтор'}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>
                    {hm}
                  </span>
                </div>
              )
            })
          )}
        </Panel>
      </div>

      <style>{`
        @keyframes btc-blink {
          0%, 80%, 100% { opacity: 0; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
