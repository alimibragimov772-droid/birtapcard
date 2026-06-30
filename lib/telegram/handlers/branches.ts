/**
 * lib/telegram/handlers/branches.ts
 *
 * Phase 2 — Owner-кабинет: список филиалов компании ("Мои филиалы")
 * и рейтинг филиалов по периоду ("Рейтинг филиалов").
 * Доступно владельцу (owner) и super_admin, у которого тоже есть company_id.
 * branch_manager сюда не попадает — у него один филиал, ему это не нужно
 * (см. меню в keyboards/menus.ts).
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { db, findProfile } from '@/lib/telegram/db'
import { navRow } from '@/lib/telegram/keyboards/main'
import { fetchCompanyReport, getReportRange, type ReportPeriod } from '@/lib/telegram/reports'

const RANK_PERIOD_MAP: Record<string, ReportPeriod> = {
  today: 'today',
  yesterday: 'yesterday',
  '7d': '7d',
  '30d': '30d',
  month: 'month',
  prev_month: 'prev_month',
}

function rankPeriodPickerKeyboard() {
  return keyboard([
    [{ text: '📅 Сегодня', callback_data: 'rank:today' }, { text: '📅 Вчера', callback_data: 'rank:yesterday' }],
    [{ text: '📅 7 дней', callback_data: 'rank:7d' }, { text: '📅 30 дней', callback_data: 'rank:30d' }],
    [{ text: '📅 Этот месяц', callback_data: 'rank:month' }, { text: '📅 Прошлый месяц', callback_data: 'rank:prev_month' }],
    navRow(),
  ])
}

// ─── 🏪 Мои филиалы ─────────────────────────────────────────────────────────

export async function handleMyBranches(chatId: number, telegramId: number) {
  const profile = await findProfile(telegramId)
  if (!profile?.company_id) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан к компании.')
    return
  }

  const supabase = db()
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, active, qr_url, nfc_url')
    .eq('company_id', profile.company_id)
    .order('name')

  if (!branches?.length) {
    await sendMessage(chatId, '🏪 У вашей компании пока нет филиалов.', { reply_markup: keyboard([navRow()]) })
    return
  }

  // Today's quick stats per branch, in one query
  const range = getReportRange('today')
  const branchIds = branches.map(b => b.id)
  const { data: events } = await supabase
    .from('scan_events')
    .select('branch_id, is_unique')
    .in('branch_id', branchIds)
    .gte('scanned_at', range.start.toISOString())
    .lte('scanned_at', range.end.toISOString())

  const todayTotal = new Map<string, number>()
  const todayUnique = new Map<string, number>()
  for (const e of events ?? []) {
    todayTotal.set(e.branch_id, (todayTotal.get(e.branch_id) ?? 0) + 1)
    if (e.is_unique) todayUnique.set(e.branch_id, (todayUnique.get(e.branch_id) ?? 0) + 1)
  }

  let text = `🏪 *Ваши филиалы* (${branches.length})\n\n`
  for (const b of branches) {
    const statusIcon = b.active ? '🟢' : '⚪️'
    const total = todayTotal.get(b.id) ?? 0
    const uniq = todayUnique.get(b.id) ?? 0
    text += `${statusIcon} *${b.name}*\n`
    text += `   📋 Сегодня: ${total} сканов · 👥 ${uniq} уникальных\n\n`
  }
  text += `_Статистика — за сегодня. Для рейтинга по периоду используйте "🏆 Рейтинг филиалов".`

  await sendMessage(chatId, text, { reply_markup: keyboard([navRow()]) })
}

// ─── 🏆 Рейтинг филиалов ─────────────────────────────────────────────────────

/** Шаг 1: выбор периода */
export async function handleBranchRankingMenu(chatId: number) {
  await sendMessage(chatId, '🏆 *Рейтинг филиалов*\n\nВыберите период:', {
    reply_markup: rankPeriodPickerKeyboard(),
  })
}

/** Шаг 2: построение и отправка рейтинга за выбранный период */
export async function handleBranchRanking(chatId: number, telegramId: number, periodArg: string) {
  const profile = await findProfile(telegramId)
  if (!profile?.company_id) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан к компании.')
    return
  }

  const period = RANK_PERIOD_MAP[periodArg] ?? 'today'
  const range = getReportRange(period)
  const supabase = db()
  const data = await fetchCompanyReport(supabase, profile.company_id, range)

  if (!data || !data.branches.length) {
    await sendMessage(chatId, '😕 Нет данных по филиалам за этот период.', { reply_markup: rankPeriodPickerKeyboard() })
    return
  }

  const sorted = [...data.branches].sort((a, b) => b.total - a.total)
  const medals = ['🥇', '🥈', '🥉']

  let text = `🏆 *Рейтинг филиалов · ${range.label}*\n🏢 ${data.companyName}\n\n`
  sorted.forEach((b, i) => {
    const place = medals[i] ?? `${i + 1}.`
    text += `${place} *${b.branchName}*\n`
    text += `   📡 NFC: ${b.nfc} · ⬛ QR: ${b.qr} · 📋 Всего: *${b.total}* · 👥 ${b.unique}\n\n`
  })

  if (sorted.every(b => b.total === 0)) {
    text += '_За этот период сканирований не было ни в одном филиале._'
  }

  await sendMessage(chatId, text, { reply_markup: rankPeriodPickerKeyboard() })
}
