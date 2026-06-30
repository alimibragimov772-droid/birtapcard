/**
 * lib/telegram/handlers/report.ts
 *
 * Формирование и отправка отчётов по статистике сканирований
 * за выбранный период, с учётом роли (owner/super_admin — вся компания,
 * branch_manager — только свой филиал).
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { db, findProfile, setState, clearState, type BotProfile } from '@/lib/telegram/db'
import { fetchOwnerReport, fetchBranchReport, getReportRange, type ReportPeriod } from '@/lib/telegram/reports'

export const CUSTOM_RANGE_STATE = 'awaiting_custom_range'

const PERIOD_MAP: Record<string, ReportPeriod> = {
  today: 'today',
  yesterday: 'yesterday',
  week: '7d',
  '7d': '7d',
  month: 'month',
  '30d': '30d',
  prev_month: 'prev_month',
}

export async function buildReport(profile: BotProfile, period: string): Promise<string | null> {
  const supabase = db()
  const p = PERIOD_MAP[period] ?? 'today'
  const range = getReportRange(p)

  if (profile.role === 'branch_manager' && profile.branch_id) {
    return await fetchBranchReport(supabase, profile.branch_id, range)
  }

  if ((profile.role === 'owner' || profile.role === 'super_admin') && profile.company_id) {
    return await fetchOwnerReport(supabase, profile.company_id, range)
  }

  return null
}

export async function handleReport(chatId: number, telegramId: number, period: string) {
  const profile = await findProfile(telegramId)
  if (!profile) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан. Перейдите на сайт для привязки.')
    return
  }

  await sendMessage(chatId, '⏳ Формирую отчёт...')

  const report = await buildReport(profile, period)
  if (!report) {
    await sendMessage(chatId, '😕 Не удалось получить данные. Попробуйте позже.')
    return
  }

  await sendMessage(chatId, report, {
    reply_markup: keyboard([
      [
        { text: '📊 Сегодня', callback_data: 'report:today' },
        { text: '📅 Вчера', callback_data: 'report:yesterday' },
      ],
      [
        { text: '📅 7 дней', callback_data: 'report:7d' },
        { text: '📅 Месяц', callback_data: 'report:month' },
      ],
    ]),
  })
}

// ─── Свой период (custom range) ──────────────────────────────────────────────
// Phase 2: ввод произвольного диапазона дат. Состояние хранится в bot_state
// (та же персистентная схема, что и awaiting_receipt), переживает рестарт.

/** Шаг 1: пользователь нажал "🗓 Свой период" — просим ввести даты текстом */
export async function handleCustomRangeRequest(chatId: number, telegramId: number) {
  await setState(telegramId, CUSTOM_RANGE_STATE)
  await sendMessage(chatId,
    '🗓 *Свой период*\n\n' +
    'Отправьте одним сообщением начальную и конечную дату в формате:\n' +
    '`ДД.ММ.ГГГГ - ДД.ММ.ГГГГ`\n\n' +
    'Например: `01.06.2026 - 15.06.2026`'
  )
}

/** Парсит "01.06.2026 - 15.06.2026" (или "01.06.2026 15.06.2026") в [start, end] (UTC, end включительно до 23:59:59.999) */
function parseCustomRange(text: string): { start: Date; end: Date } | null {
  const m = text.trim().match(
    /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
  )
  if (!m) return null
  const [, d1, mo1, y1, d2, mo2, y2] = m.map(Number) as unknown as number[]
  const start = new Date(Date.UTC(y1, mo1 - 1, d1))
  const end = new Date(Date.UTC(y2, mo2 - 1, d2, 23, 59, 59, 999))
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  if (end.getTime() < start.getTime()) return null
  // Защита от опечаток на годы в далёком будущем/прошлом
  const minYear = 2020
  const maxYear = new Date().getUTCFullYear() + 1
  if (y1 < minYear || y1 > maxYear || y2 < minYear || y2 > maxYear) return null
  return { start, end }
}

/** Шаг 2: пользователь прислал текст с датами — парсим и строим отчёт */
export async function handleCustomRangeInput(chatId: number, telegramId: number, text: string) {
  await clearState(telegramId)

  const parsed = parseCustomRange(text)
  if (!parsed) {
    await sendMessage(chatId,
      '❌ Не удалось распознать даты.\n\n' +
      'Формат: `ДД.ММ.ГГГГ - ДД.ММ.ГГГГ`, например `01.06.2026 - 15.06.2026`.\n' +
      'Попробуйте ещё раз через «📅 Выбрать период» → «🗓 Свой период».'
    )
    return
  }

  const profile = await findProfile(telegramId)
  if (!profile) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан. Перейдите на сайт для привязки.')
    return
  }

  await sendMessage(chatId, '⏳ Формирую отчёт...')

  const supabase = db()
  const range = getReportRange('custom', parsed.start, parsed.end)

  let report: string | null = null
  if (profile.role === 'branch_manager' && profile.branch_id) {
    report = await fetchBranchReport(supabase, profile.branch_id, range)
  } else if ((profile.role === 'owner' || profile.role === 'super_admin') && profile.company_id) {
    report = await fetchOwnerReport(supabase, profile.company_id, range)
  }

  if (!report) {
    await sendMessage(chatId, '😕 Не удалось получить данные. Попробуйте позже.')
    return
  }

  await sendMessage(chatId, report)
}
