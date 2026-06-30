/**
 * lib/telegram/handlers/start.ts
 *
 * /start без токена — приветствие/онбординг.
 * /start TOKEN — привязка Telegram-аккаунта к пользователю BirTap.
 */

import { sendMessage } from '@/lib/telegram/bot'
import { db, findProfile } from '@/lib/telegram/db'
import { MAIN_MENU } from '@/lib/telegram/keyboards/main'
import type { TgUser } from '@/lib/telegram/types'

export async function handleStart(chatId: number, telegramId: number) {
  const profile = await findProfile(telegramId)

  if (!profile) {
    await sendMessage(chatId,
      '👋 Добро пожаловать в *BirTapCard Statistics Bot*!\n\n' +
      'Этот бот отправляет вам ежедневную статистику по вашим ресторанам и управляет подпиской.\n\n' +
      '🔗 Чтобы начать, привяжите Telegram-аккаунт в личном кабинете.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔗 Привязать Telegram', url: 'https://birtapcard.vercel.app/telegram' }]],
        },
      }
    )
    return
  }

  await sendMessage(chatId,
    `✅ Привет, *${profile.full_name ?? 'друг'}*!\n\n` +
    `Ваш аккаунт подключён. Используйте меню для управления.`,
    { reply_markup: MAIN_MENU }
  )
}

export async function handleLinkToken(chatId: number, telegramId: number, tgUser: TgUser, token: string) {
  const supabase = db()

  const { data: acc } = await supabase
    .from('telegram_accounts')
    .select('id, user_id, expires_at')
    .eq('link_token', token)
    .is('confirmed_at', null)
    .single()

  if (!acc) {
    await sendMessage(chatId, '❌ Ссылка недействительна или уже использована. Запросите новую в личном кабинете.')
    return
  }

  if (acc.expires_at && new Date(acc.expires_at) < new Date()) {
    await sendMessage(chatId, '⏰ Ссылка истекла. Пожалуйста, запросите новую.')
    return
  }

  await supabase
    .from('telegram_accounts')
    .update({
      telegram_id: telegramId,
      username: tgUser.username ?? null,
      confirmed_at: new Date().toISOString(),
      link_token: null,
    })
    .eq('id', acc.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', acc.user_id)
    .single()

  await sendMessage(chatId,
    `✅ *Telegram успешно привязан!*\n\n` +
    `Добро пожаловать${profile?.full_name ? `, *${profile.full_name}*` : ''}!\n\n` +
    `Теперь вы будете получать:\n` +
    `• Ежедневные отчёты по статистике\n` +
    `• Напоминания о подписке\n` +
    `• Уведомления об оплате\n\n` +
    `Используйте меню ниже для управления.`,
    { reply_markup: MAIN_MENU }
  )
}
