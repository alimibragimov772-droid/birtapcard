/**
 * lib/telegram/router.ts
 *
 * Маршрутизация входящих message-апдейтов (текст, фото, документы).
 * Это единственное место, которое решает "что делать с сообщением" —
 * webhook route.ts остаётся тонким HTTP-слоем над этим модулем.
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { findProfile } from '@/lib/telegram/db'
import { MAIN_MENU } from '@/lib/telegram/keyboards/main'
import type { TgMessage } from '@/lib/telegram/types'
import { handleStart, handleLinkToken } from '@/lib/telegram/handlers/start'
import { handleReport } from '@/lib/telegram/handlers/report'
import {
  handleSubscriptionMenu,
  handleReceiptUpload,
  isAwaitingReceipt,
} from '@/lib/telegram/handlers/subscription'
import { handleSettings, handleHelp } from '@/lib/telegram/handlers/settings'

const COMMAND_MAP: Record<string, string> = {
  '/today': 'today',
  '/yesterday': 'yesterday',
  '/week': '7d',
  '/month': 'month',
  '/report': 'today',
  '📊 Статистика сегодня': 'today',
}

export async function handleMessage(msg: TgMessage) {
  const chatId = msg.chat.id
  const telegramId = msg.from?.id
  if (!telegramId) return

  // Загрузка чека: ждём фото/документ для активной заявки на оплату
  if ((msg.photo || msg.document) && (await isAwaitingReceipt(telegramId))) {
    await handleReceiptUpload(chatId, telegramId, msg)
    return
  }

  const text = (msg.text ?? '').trim()

  // ─── /start ────────────────────────────────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    const token = text.split(' ')[1]
    if (token) {
      await handleLinkToken(chatId, telegramId, msg.from!, token)
    } else {
      await handleStart(chatId, telegramId)
    }
    return
  }

  // ─── Команды и кнопки отчётов ─────────────────────────────────────────
  if (COMMAND_MAP[text] !== undefined) {
    await handleReport(chatId, telegramId, COMMAND_MAP[text])
    return
  }

  // ─── Меню периодов ──────────────────────────────────────────────────────
  if (text === '📅 Выбрать период' || text === '/periods') {
    await sendMessage(chatId, '📅 *Выберите период:*', {
      reply_markup: keyboard([
        [{ text: '📅 Сегодня', callback_data: 'report:today' }, { text: '📅 Вчера', callback_data: 'report:yesterday' }],
        [{ text: '📅 7 дней', callback_data: 'report:7d' }, { text: '📅 30 дней', callback_data: 'report:30d' }],
        [{ text: '📅 Этот месяц', callback_data: 'report:month' }, { text: '📅 Прошлый месяц', callback_data: 'report:prev_month' }],
      ]),
    })
    return
  }

  // ─── Подписка и оплата ──────────────────────────────────────────────────
  if (text === '💳 Подписка и оплата' || text === '/subscription' || text === '/pay') {
    await handleSubscriptionMenu(chatId, telegramId)
    return
  }

  // ─── Настройки ───────────────────────────────────────────────────────────
  if (text === '⚙️ Настройки' || text === '/settings') {
    await handleSettings(chatId, telegramId)
    return
  }

  // ─── Помощь ──────────────────────────────────────────────────────────────
  if (text === '❓ Помощь' || text === '/help') {
    await handleHelp(chatId)
    return
  }

  // ─── Неизвестная команда ─────────────────────────────────────────────────
  const profile = await findProfile(telegramId)
  if (!profile) {
    await sendMessage(chatId,
      '👋 Привет! Я *BirTapCard Statistics Bot*.\n\n' +
      'Чтобы начать, привяжите свой Telegram-аккаунт в разделе *Telegram* на сайте birtapcard.vercel.app',
      { reply_markup: { inline_keyboard: [[{ text: '🔗 Перейти на сайт', url: 'https://birtapcard.vercel.app/telegram' }]] } }
    )
    return
  }

  await sendMessage(chatId,
    'Используйте кнопки меню ниже или команды:\n\n' +
    '/today — статистика сегодня\n' +
    '/week — за 7 дней\n' +
    '/month — за месяц\n' +
    '/subscription — подписка и оплата\n' +
    '/help — справка',
    { reply_markup: MAIN_MENU }
  )
}
