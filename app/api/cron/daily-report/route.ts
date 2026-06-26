import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase service-role клиент (полный доступ, минуя RLS) ─────────────────
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─── Отправка сообщения в Telegram ────────────────────────────────────────────
async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

// ─── Форматирование даты вида 26.06.2026 ──────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Cron endpoint ────────────────────────────────────────────────────────────
//
// Vercel Cron вызывает этот маршрут по расписанию (см. vercel.json):
//   "0 3 * * *"  →  03:00 UTC = 08:00 по Ташкенту (UTC+5)
//
// Заголовок Authorization: Bearer <CRON_SECRET> обязателен.

export async function GET(req: NextRequest) {
  // ── Проверка секрета ──────────────────────────────────────────────────────
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // ── Диапазон: вчера 00:00 — 23:59:59 UTC ─────────────────────────────────
  const now = new Date()
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterdayStart = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayEnd = new Date(todayUTC.getTime() - 1) // на 1 мс раньше сегодня
  const reportDate = fmtDate(yesterdayStart)

  // ── Компании с активными Telegram-настройками ─────────────────────────────
  const { data: tgSettings, error: tgErr } = await supabase
    .from('telegram_settings')
    .select('id, company_id, chat_id, companies(id, name, active)')
    .eq('notify_daily', true)
    .eq('active', true)

  if (tgErr) {
    console.error('[cron/daily-report] telegram_settings error:', tgErr)
    return NextResponse.json({ error: tgErr.message }, { status: 500 })
  }

  const results: { company: string; sent: boolean; error?: string }[] = []

  for (const tg of tgSettings ?? []) {
    const rawCompany = Array.isArray(tg.companies) ? tg.companies[0] : tg.companies
    const company = rawCompany as { id: string; name: string; active: boolean } | null
    if (!company || !company.active || !tg.chat_id) continue

    // ── Филиалы компании ────────────────────────────────────────────────────
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', company.id)
      .eq('active', true)

    if (!branches || branches.length === 0) continue

    const branchIds = branches.map(b => b.id)

    // ── Статистика за вчера из scan_events ──────────────────────────────────
    const { data: events } = await supabase
      .from('scan_events')
      .select('branch_id, scan_type, is_unique')
      .in('branch_id', branchIds)
      .gte('scanned_at', yesterdayStart.toISOString())
      .lte('scanned_at', yesterdayEnd.toISOString())

    const totalNfc = events?.filter(e => e.scan_type === 'nfc').length ?? 0
    const totalQr = events?.filter(e => e.scan_type === 'qr').length ?? 0
    const totalScans = (events?.length) ?? 0
    const uniqueScans = events?.filter(e => e.is_unique).length ?? 0
    const conversion = totalScans > 0 ? ((uniqueScans / totalScans) * 100).toFixed(1) : '0.0'

    // ── Лучший филиал (по кол-ву сканов) ────────────────────────────────────
    const countByBranch: Record<string, number> = {}
    for (const e of events ?? []) {
      countByBranch[e.branch_id] = (countByBranch[e.branch_id] ?? 0) + 1
    }
    let bestBranch: string | null = null
    let bestCount = 0
    for (const [bid, count] of Object.entries(countByBranch)) {
      if (count > bestCount) { bestCount = count; bestBranch = bid }
    }
    const bestBranchName = branches.find(b => b.id === bestBranch)?.name ?? null

    // ── Формируем сообщение ──────────────────────────────────────────────────
    let text =
      `📊 *BirTapCard · Отчёт за ${reportDate}*\n\n` +
      `🏪 *${company.name}*\n` +
      `📡 NFC: ${totalNfc} сканирований\n` +
      `⬛ QR: ${totalQr} сканирований\n` +
      `👥 Уникальных: ${uniqueScans}\n` +
      `📈 Конверсия: ${conversion}%`

    if (bestBranchName && totalScans > 0) {
      text += `\n\n🏆 Лучший филиал: *${bestBranchName}* (${bestCount} сканов)`
    }

    if (totalScans === 0) {
      text += '\n\n_Вчера сканирований не было._'
    }

    // ── Отправляем ──────────────────────────────────────────────────────────
    const sent = await sendTelegram(tg.chat_id, text)
    results.push({ company: company.name, sent })
  }

  console.log(`[cron/daily-report] ${reportDate}: sent=${results.filter(r => r.sent).length}/${results.length}`)

  return NextResponse.json({
    ok: true,
    date: reportDate,
    results,
  })
}