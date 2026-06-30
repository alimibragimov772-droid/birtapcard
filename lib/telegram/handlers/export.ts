/**
 * lib/telegram/handlers/export.ts
 *
 * Phase 2 — "📄 Скачать отчёт": экспорт статистики в CSV (без внешних
 * зависимостей — собираем вручную, открывается в Excel/Google Sheets).
 *
 * PDF/Excel(.xlsx) экспорт сознательно НЕ реализован в этой фазе:
 * на serverless (Vercel) недоступны тяжёлые headless-браузеры (puppeteer)
 * без отдельной настройки (Browserless/Chromium-layer), а xlsx-генерация
 * требует доп. библиотеки (exceljs/sheetjs), которую ещё не добавляли
 * в package.json. CSV открывается тем же ПО и не требует зависимостей —
 * выбран как промежуточное решение. См. чат/хэндофф для финального решения
 * по PDF/Excel движку.
 */

import { sendMessage, sendDocument, keyboard } from '@/lib/telegram/bot'
import { db, findProfile } from '@/lib/telegram/db'
import { navRow } from '@/lib/telegram/keyboards/main'
import { fetchCompanyReport, getReportRange, type ReportPeriod } from '@/lib/telegram/reports'

const EXPORT_PERIOD_MAP: Record<string, ReportPeriod> = {
  today: 'today',
  yesterday: 'yesterday',
  '7d': '7d',
  '30d': '30d',
  month: 'month',
  prev_month: 'prev_month',
}

export async function handleExportMenu(chatId: number) {
  await sendMessage(chatId, '📄 *Скачать отчёт*\n\nВыберите период для экспорта в CSV:', {
    reply_markup: keyboard([
      [{ text: '📅 Сегодня', callback_data: 'export:today' }, { text: '📅 Вчера', callback_data: 'export:yesterday' }],
      [{ text: '📅 7 дней', callback_data: 'export:7d' }, { text: '📅 30 дней', callback_data: 'export:30d' }],
      [{ text: '📅 Этот месяц', callback_data: 'export:month' }, { text: '📅 Прошлый месяц', callback_data: 'export:prev_month' }],
      navRow(),
    ]),
  })
}

function toCsvRow(cells: (string | number)[]): string {
  return cells
    .map(c => {
      const s = String(c)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(';') + '\r\n'
}

export async function handleExportReport(chatId: number, telegramId: number, periodArg: string) {
  const profile = await findProfile(telegramId)
  if (!profile?.company_id) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан к компании.')
    return
  }

  const period = EXPORT_PERIOD_MAP[periodArg] ?? 'today'
  const range = getReportRange(period)
  const supabase = db()
  const data = await fetchCompanyReport(supabase, profile.company_id, range)

  if (!data) {
    await sendMessage(chatId, '😕 Не удалось получить данные за этот период.')
    return
  }

  await sendMessage(chatId, '⏳ Формирую файл...')

  // BOM, чтобы Excel на Windows корректно показывал кириллицу
  let csv = '\uFEFF'
  csv += toCsvRow(['Отчёт BirTap', range.label, data.companyName])
  csv += toCsvRow([])
  csv += toCsvRow(['Филиал', 'NFC', 'QR', 'Всего', 'Уникальные'])
  for (const b of data.branches) {
    csv += toCsvRow([b.branchName, b.nfc, b.qr, b.total, b.unique])
  }
  csv += toCsvRow([])
  csv += toCsvRow(['ИТОГО', data.nfc, data.qr, data.total, data.unique])

  const filename = `birtap_report_${periodArg}_${new Date().toISOString().slice(0, 10)}.csv`

  const res = await sendDocument(chatId, filename, csv, `📄 Отчёт за период: *${range.label}*`)
  if (!res.ok) {
    await sendMessage(chatId, '❌ Не удалось отправить файл. Попробуйте ещё раз.')
  }
}
