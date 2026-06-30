/**
 * lib/telegram/handlers/admin.ts
 *
 * Действия super_admin над заявками на оплату: подтвердить / отклонить.
 * При подтверждении подписка компании продлевается автоматически.
 */

import { sendMessage, answerCallback } from '@/lib/telegram/bot'
import { db, findProfile } from '@/lib/telegram/db'

export async function handleAdminApprove(callbackId: string, adminTelegramId: number, receiptId: string) {
  const profile = await findProfile(adminTelegramId)
  if (!profile || profile.role !== 'super_admin') {
    await answerCallback(callbackId, '⛔ Нет доступа', true)
    return
  }

  const supabase = db()
  const { data: receipt } = await supabase
    .from('payment_receipts')
    .select('company_id, months, amount, currency, user_id')
    .eq('id', receiptId)
    .single()

  if (!receipt) {
    await answerCallback(callbackId, '❌ Заявка не найдена', true)
    return
  }

  const now = new Date()
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id, ends_at')
    .eq('company_id', receipt.company_id)
    .single()

  const baseDate = existingSub?.ends_at && new Date(existingSub.ends_at) > now
    ? new Date(existingSub.ends_at)
    : now

  const newEndsAt = new Date(baseDate)
  newEndsAt.setMonth(newEndsAt.getMonth() + receipt.months)

  if (existingSub) {
    await supabase
      .from('subscriptions')
      .update({ status: 'active', ends_at: newEndsAt.toISOString() })
      .eq('id', existingSub.id)
  }

  await supabase
    .from('payment_receipts')
    .update({ status: 'approved', reviewed_at: now.toISOString() })
    .eq('id', receiptId)

  await answerCallback(callbackId, '✅ Оплата подтверждена!')

  const { data: tgAcc } = await supabase
    .from('telegram_accounts')
    .select('telegram_id')
    .eq('user_id', receipt.user_id)
    .single()

  if (tgAcc?.telegram_id) {
    const endsAtStr = newEndsAt.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    await sendMessage(tgAcc.telegram_id,
      `✅ *Оплата подтверждена!*\n\n` +
      `Ваша подписка активирована.\n` +
      `📅 Действует до: *${endsAtStr}*\n\n` +
      `Спасибо за оплату!`
    )
  }
}

export async function handleAdminReject(callbackId: string, adminTelegramId: number, receiptId: string) {
  const profile = await findProfile(adminTelegramId)
  if (!profile || profile.role !== 'super_admin') {
    await answerCallback(callbackId, '⛔ Нет доступа', true)
    return
  }

  const supabase = db()
  const { data: receipt } = await supabase
    .from('payment_receipts')
    .select('user_id')
    .eq('id', receiptId)
    .single()

  if (!receipt) {
    await answerCallback(callbackId, '❌ Заявка не найдена', true)
    return
  }

  await supabase
    .from('payment_receipts')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', receiptId)

  await answerCallback(callbackId, '❌ Заявка отклонена')

  const { data: tgAcc } = await supabase
    .from('telegram_accounts')
    .select('telegram_id')
    .eq('user_id', receipt.user_id)
    .single()

  if (tgAcc?.telegram_id) {
    await sendMessage(tgAcc.telegram_id,
      `❌ *Оплата не подтверждена*\n\n` +
      `К сожалению, мы не смогли подтвердить вашу оплату.\n\n` +
      `Пожалуйста, попробуйте снова или свяжитесь с поддержкой.`,
      {
        reply_markup: { inline_keyboard: [[{ text: '💳 Попробовать снова', callback_data: 'pay_start' }]] },
      }
    )
  }
}
