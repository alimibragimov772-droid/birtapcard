/**
 * lib/telegram/handlers/report.ts
 *
 * Формирование и отправка отчётов по статистике сканирований
 * за выбранный период, с учётом роли (owner/super_admin — вся компания,
 * branch_manager — только свой филиал).
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { db, findProfile, type BotProfile } from '@/lib/telegram/db'
import { fetchOwnerReport, fetchBranchReport, getReportRange, type ReportPeriod } from '@/lib/telegram/reports'

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
