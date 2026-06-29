/**
 * lib/telegram/reports.ts
 *
 * Builds formatted Telegram report messages for any date range.
 * Used by: the daily cron, /today /week /month bot commands, on-demand /report.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type ReportPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'prev_month' | 'custom'

export interface ReportRange {
  start: Date
  end: Date
  label: string
}

/** Compute UTC date ranges for standard periods */
export function getReportRange(period: ReportPeriod, customStart?: Date, customEnd?: Date): ReportRange {
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)

  switch (period) {
    case 'today':
      return { start: todayStart, end: todayEnd, label: 'Сегодня' }

    case 'yesterday': {
      const s = new Date(todayStart.getTime() - 86400000)
      return { start: s, end: new Date(s.getTime() + 86400000 - 1), label: 'Вчера' }
    }

    case '7d': {
      const s = new Date(todayStart.getTime() - 7 * 86400000)
      return { start: s, end: todayEnd, label: 'Последние 7 дней' }
    }

    case '30d': {
      const s = new Date(todayStart.getTime() - 30 * 86400000)
      return { start: s, end: todayEnd, label: 'Последние 30 дней' }
    }

    case 'month': {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      return { start: s, end: todayEnd, label: 'Этот месяц' }
    }

    case 'prev_month': {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999))
      const monthName = s.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
      return { start: s, end: e, label: `Прошлый месяц (${monthName})` }
    }

    case 'custom':
      if (!customStart || !customEnd) throw new Error('Custom range requires start and end dates')
      return {
        start: customStart,
        end: customEnd,
        label: `${fmtDate(customStart)} — ${fmtDate(customEnd)}`,
      }
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function pct(a: number, b: number): string {
  if (b === 0) return '0.0%'
  return ((a / b) * 100).toFixed(1) + '%'
}

function trend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? ' 🆕' : ''
  const delta = current - previous
  if (delta === 0) return ' ➖'
  const sign = delta > 0 ? '+' : ''
  return ` (${sign}${delta})`
}

export interface BranchStats {
  branchId: string
  branchName: string
  nfc: number
  qr: number
  total: number
  unique: number
}

export interface ReportData {
  label: string
  companyName: string
  nfc: number
  qr: number
  total: number
  unique: number
  googleReviews: number
  conversion: string
  bestBranch: BranchStats | null
  worstBranch: BranchStats | null
  branches: BranchStats[]
  // Previous period for comparison
  prevTotal: number
}

/** Fetch stats for a company and date range */
export async function fetchCompanyReport(
  supabase: SupabaseClient,
  companyId: string,
  range: ReportRange,
  prevRange?: ReportRange
): Promise<ReportData | null> {
  // Company name
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()

  if (!company) return null

  // Branches
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('active', true)

  if (!branches?.length) return null

  const branchIds = branches.map(b => b.id)

  // Current period scan events
  const { data: events } = await supabase
    .from('scan_events')
    .select('branch_id, scan_type, is_unique')
    .in('branch_id', branchIds)
    .gte('scanned_at', range.start.toISOString())
    .lte('scanned_at', range.end.toISOString())

  const ev = events ?? []

  // Per-branch breakdown
  const branchMap = new Map<string, BranchStats>()
  for (const b of branches) {
    branchMap.set(b.id, { branchId: b.id, branchName: b.name, nfc: 0, qr: 0, total: 0, unique: 0 })
  }
  for (const e of ev) {
    const bs = branchMap.get(e.branch_id)
    if (!bs) continue
    bs.total++
    if (e.scan_type === 'nfc') bs.nfc++
    else if (e.scan_type === 'qr') bs.qr++
    if (e.is_unique) bs.unique++
  }

  const branchStats = Array.from(branchMap.values())
  const sorted = [...branchStats].sort((a, b) => b.total - a.total)
  const bestBranch = sorted[0]?.total > 0 ? sorted[0] : null
  const worstBranch = sorted.length > 1 && sorted[sorted.length - 1].total < sorted[0].total
    ? sorted[sorted.length - 1]
    : null

  const totalNfc = ev.filter(e => e.scan_type === 'nfc').length
  const totalQr = ev.filter(e => e.scan_type === 'qr').length
  const total = ev.length
  const unique = ev.filter(e => e.is_unique).length
  // Google reviews = unique visitors (proxy; adjust if you track explicitly)
  const googleReviews = unique

  // Previous period
  let prevTotal = 0
  if (prevRange) {
    const { data: prevEvents } = await supabase
      .from('scan_events')
      .select('id')
      .in('branch_id', branchIds)
      .gte('scanned_at', prevRange.start.toISOString())
      .lte('scanned_at', prevRange.end.toISOString())
    prevTotal = prevEvents?.length ?? 0
  }

  return {
    label: range.label,
    companyName: company.name,
    nfc: totalNfc,
    qr: totalQr,
    total,
    unique,
    googleReviews,
    conversion: pct(googleReviews, total),
    bestBranch,
    worstBranch,
    branches: branchStats,
    prevTotal,
  }
}

/** Format a ReportData into a Telegram Markdown message */
export function formatReport(data: ReportData): string {
  const changeText = data.prevTotal > 0
    ? trend(data.total, data.prevTotal)
    : ''

  let msg =
    `📊 *BirTap · ${data.label}*\n` +
    `🏪 *${data.companyName}*\n\n` +
    `📡 NFC сканирований: *${data.nfc}*\n` +
    `⬛ QR сканирований: *${data.qr}*\n` +
    `📋 Всего сканирований: *${data.total}*${changeText}\n` +
    `👥 Уникальные посетители: *${data.unique}*\n` +
    `⭐ Переходы (Google Reviews): *${data.googleReviews}*\n` +
    `📈 Конверсия: *${data.conversion}*`

  if (data.bestBranch && data.total > 0) {
    msg += `\n\n🏆 Лучший филиал: *${data.bestBranch.branchName}* (${data.bestBranch.total} сканов)`
  }
  if (data.worstBranch && data.branches.length > 1) {
    msg += `\n📉 Худший филиал: *${data.worstBranch.branchName}* (${data.worstBranch.total} сканов)`
  }

  if (data.total === 0) {
    msg += '\n\n_За этот период сканирований не было._'
  }

  return msg
}

/** Fetch and format report for an owner/super_admin (whole company) */
export async function fetchOwnerReport(
  supabase: SupabaseClient,
  companyId: string,
  range: ReportRange
): Promise<string | null> {
  const data = await fetchCompanyReport(supabase, companyId, range)
  if (!data) return null
  return formatReport(data)
}

/** Fetch report for a single branch (for branch_manager role) */
export async function fetchBranchReport(
  supabase: SupabaseClient,
  branchId: string,
  range: ReportRange
): Promise<string | null> {
  const { data: branch } = await supabase
    .from('branches')
    .select('name, companies(name)')
    .eq('id', branchId)
    .single()

  if (!branch) return null

  const { data: events } = await supabase
    .from('scan_events')
    .select('scan_type, is_unique')
    .eq('branch_id', branchId)
    .gte('scanned_at', range.start.toISOString())
    .lte('scanned_at', range.end.toISOString())

  const ev = events ?? []
  const nfc = ev.filter(e => e.scan_type === 'nfc').length
  const qr = ev.filter(e => e.scan_type === 'qr').length
  const total = ev.length
  const unique = ev.filter(e => e.is_unique).length
  const companies = branch.companies as { name: string }[] | { name: string } | null
  const companyName = (Array.isArray(companies) ? companies[0]?.name : companies?.name) ?? ''

  return (
    `📊 *BirTap · ${range.label}*\n` +
    `🏪 *${companyName}* — ${branch.name}\n\n` +
    `📡 NFC: *${nfc}*\n` +
    `⬛ QR: *${qr}*\n` +
    `📋 Всего: *${total}*\n` +
    `👥 Уникальных: *${unique}*\n` +
    `📈 Конверсия: *${pct(unique, total)}*` +
    (total === 0 ? '\n\n_За этот период сканирований не было._' : '')
  )
}