/**
 * lib/telegram/router.ts
 *
 * Маршрутизация входящих message-апдейтов (текст, фото, документы).
 * Это единственное место, которое решает "что делать с сообщением" —
 * webhook route.ts остаётся тонким HTTP-слоем над этим модулем.
 *
 * Phase 1: меню и текстовые кнопки теперь зависят от роли пользователя
 * (super_admin / owner / branch_manager). Разделы, которых ещё нет
 * (см. план фаз), отвечают экраном "скоро" через comingSoon(), но кнопка
 * уже в меню — навигация не будет визуально меняться от фазы к фазе.
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { findProfile, getState, type BotProfile } from '@/lib/telegram/db'
import { menuForRole } from '@/lib/telegram/keyboards/menus'
import type { TgMessage } from '@/lib/telegram/types'
import { handleStart, handleLinkToken } from '@/lib/telegram/handlers/start'
import { handleReport, handleCustomRangeRequest, handleCustomRangeInput, CUSTOM_RANGE_STATE } from '@/lib/telegram/handlers/report'
import {
  handleSubscriptionMenu,
  handleReceiptUpload,
  isAwaitingReceipt,
} from '@/lib/telegram/handlers/subscription'
import { handleSettings, handleHelp } from '@/lib/telegram/handlers/settings'
import { comingSoon } from '@/lib/telegram/handlers/comingSoon'
import { handleMyBranches, handleBranchRankingMenu } from '@/lib/telegram/handlers/branches'
import { handleExportMenu } from '@/lib/telegram/handlers/export'

const COMMAND_MAP: Record<string, string> = {
  '/today': 'today',
  '/yesterday': 'yesterday',
  '/week': '7d',
  '/month': 'month',
  '/report': 'today',
}

async function sendPeriodPicker(chatId: number) {
  await sendMessage(chatId, '📅 *Выберите период:*', {
    reply_markup: keyboard([
      [{ text: '📅 Сегодня', callback_data: 'report:today' }, { text: '📅 Вчера', callback_data: 'report:yesterday' }],
      [{ text: '📅 7 дней', callback_data: 'report:7d' }, { text: '📅 30 дней', callback_data: 'report:30d' }],
      [{ text: '📅 Этот месяц', callback_data: 'report:month' }, { text: '📅 Прошлый месяц', callback_data: 'report:prev_month' }],
      [{ text: '🗓 Свой период', callback_data: 'report:custom' }],
    ]),
  })
}

/**
 * Текстовая навигация для уже привязанного пользователя.
 * Возвращает true, если сообщение было обработано как пункт меню/команда.
 */
async function dispatchMenuText(chatId: number, telegramId: number, profile: BotProfile, text: string): Promise<boolean> {
  // ─── Общие для всех ролей ──────────────────────────────────────────────
  if (COMMAND_MAP[text] !== undefined) {
    await handleReport(chatId, telegramId, COMMAND_MAP[text])
    return true
  }

  if (text === '📅 Выбрать период' || text === '/periods') {
    await sendPeriodPicker(chatId)
    return true
  }

  if (text === '⚙️ Настройки' || text === '⚙ Настройки' || text === '/settings') {
    await handleSettings(chatId, telegramId)
    return true
  }

  if (text === '❓ Помощь' || text === 'ℹ Информация' || text === '/help') {
    await handleHelp(chatId)
    return true
  }

  // ─── "📈 Аналитика" неоднозначна: у owner это период, у super_admin — раздел Фазы 4 ──
  if (text === '📈 Аналитика') {
    if (profile.role === 'super_admin') {
      await comingSoon(chatId, 'Аналитика платформы', 'Фазе 4')
    } else {
      await sendPeriodPicker(chatId)
    }
    return true
  }

  // ─── Owner / Branch Manager ─────────────────────────────────────────────
  if (text === '📊 Сегодня') {
    await handleReport(chatId, telegramId, 'today')
    return true
  }

  if (text === '📈 Статистика') {
    await sendPeriodPicker(chatId)
    return true
  }

  if (text === '📄 Отчёт') {
    await handleReport(chatId, telegramId, 'today')
    return true
  }

  if (text === '💳 Подписка' || text === '💳 Подписка и оплата' || text === '/subscription' || text === '/pay') {
    await handleSubscriptionMenu(chatId, telegramId)
    return true
  }

  if (text === '📄 Скачать отчёт') {
    await handleExportMenu(chatId)
    return true
  }

  if (text === '🏪 Мои филиалы') {
    await handleMyBranches(chatId, telegramId)
    return true
  }

  if (text === '🏆 Рейтинг филиалов') {
    await handleBranchRankingMenu(chatId)
    return true
  }

  if (text === '🔔 Уведомления') {
    await comingSoon(chatId, 'Настройка уведомлений', 'Фазе 5')
    return true
  }

  if (text === '🆘 Поддержка') {
    await comingSoon(chatId, 'Поддержка', 'Фазе 6')
    return true
  }

  // ─── Super Admin (Фаза 4) ────────────────────────────────────────────────
  const adminStubs: Record<string, string> = {
    '📊 Статистика платформы': 'Статистика платформы',
    '🏢 Компании': 'Компании',
    '🍽 Рестораны': 'Рестораны',
    '🏪 Филиалы': 'Филиалы',
    '👥 Пользователи': 'Пользователи',
    '💳 Подписки': 'Подписки клиентов',
    '💰 Оплаты': 'Оплаты',
    '📩 Новые чеки': 'Новые чеки',
    '📢 Рассылка': 'Рассылка',
    '🤖 Telegram': 'Управление Telegram-ботом',
  }
  if (adminStubs[text]) {
    await comingSoon(chatId, adminStubs[text], 'Фазе 4')
    return true
  }

  return false
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

  // Свой период: ждём от пользователя текст с датами (Фаза 2)
  if (text && !text.startsWith('/')) {
    const state = await getState(telegramId)
    if (state?.state === CUSTOM_RANGE_STATE) {
      await handleCustomRangeInput(chatId, telegramId, text)
      return
    }
  }

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

  const profile = await findProfile(telegramId)

  // ─── Не привязан ─────────────────────────────────────────────────────────
  if (!profile) {
    await sendMessage(chatId,
      '👋 Привет! Я *BirTapCard Statistics Bot*.\n\n' +
      'Чтобы начать, привяжите свой Telegram-аккаунт в разделе *Telegram* на сайте birtapcard.vercel.app',
      { reply_markup: { inline_keyboard: [[{ text: '🔗 Перейти на сайт', url: 'https://birtapcard.vercel.app/telegram' }]] } }
    )
    return
  }

  // ─── Пункты меню / команды по роли ───────────────────────────────────────
  const handled = await dispatchMenuText(chatId, telegramId, profile, text)
  if (handled) return

  // ─── Неизвестное сообщение ────────────────────────────────────────────────
  await sendMessage(chatId,
    'Не понял команду 🤔 Используйте кнопки меню ниже.',
    { reply_markup: menuForRole(profile.role) }
  )
}
