/**
 * lib/telegram/handlers/settings.ts
 *
 * Экраны "Настройки" и "Помощь".
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { findProfile } from '@/lib/telegram/db'
import { navRow } from '@/lib/telegram/keyboards/main'

export async function handleSettings(chatId: number, telegramId: number) {
  const profile = await findProfile(telegramId)
  if (!profile) {
    await sendMessage(chatId, '⚠️ Аккаунт не привязан.')
    return
  }

  await sendMessage(chatId,
    `⚙️ *Настройки*\n\n` +
    `👤 Аккаунт: *${profile.full_name ?? '—'}*\n` +
    `🎭 Роль: *${profile.role}*\n\n` +
    `Управляйте настройками уведомлений на сайте:`,
    {
      reply_markup: keyboard([
        [{ text: '⚙️ Настройки на сайте', url: 'https://birtapcard.vercel.app/telegram' }],
        navRow(),
      ]),
    }
  )
}

export async function handleHelp(chatId: number) {
  await sendMessage(chatId,
    `❓ *Справка по BirTapCard Bot*\n\n` +
    `📊 *Статистика:*\n` +
    `/today — сегодня\n` +
    `/yesterday — вчера\n` +
    `/week — 7 дней\n` +
    `/month — этот месяц\n\n` +
    `💳 *Подписка:*\n` +
    `/subscription — статус и оплата\n\n` +
    `⚙️ *Аккаунт:*\n` +
    `/settings — настройки\n\n` +
    `📞 *Поддержка:* @birtapcard_support`,
    {
      reply_markup: keyboard([
        [{ text: '📊 Статистика', callback_data: 'report:today' }],
        [{ text: '💳 Подписка', callback_data: 'sub_menu' }],
      ]),
    }
  )
}
