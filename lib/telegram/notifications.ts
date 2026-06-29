/**
 * lib/telegram/notifications.ts
 *
 * High-level notification helpers.
 * All business-facing message sends go through here, not through bot.ts directly.
 * This layer: fetches templates, substitutes vars, logs to telegram_messages, sends.
 */

import { createClient } from '@supabase/supabase-js'
import { sendMessage, keyboard } from './bot'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/** Resolve a template and substitute {{key}} vars */
async function renderTemplate(
  templateKey: string,
  vars: Record<string, string> = {}
): Promise<string | null> {
  const supabase = serviceClient()
  const { data } = await supabase
    .from('message_templates')
    .select('body')
    .eq('key', templateKey)
    .single()

  if (!data) return null

  let text = data.body
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v)
  }
  return text
}

/** Log outbound message to telegram_messages table */
async function logMessage(
  telegramId: number,
  messageType: string,
  textSent: string,
  status: 'sent' | 'failed',
  telegramMsgId?: number,
  errorMessage?: string,
  payload?: Record<string, unknown>
) {
  const supabase = serviceClient()
  await supabase.from('telegram_messages').insert({
    telegram_id: telegramId,
    message_type: messageType,
    text_sent: textSent,
    status,
    telegram_msg_id: telegramMsgId ?? null,
    error_message: errorMessage ?? null,
    payload: payload ?? null,
  })
}

/** Send a subscription reminder using a template key */
export async function sendSubscriptionReminder(
  telegramId: number,
  templateKey: string,
  vars: Record<string, string>
): Promise<boolean> {
  const text = await renderTemplate(templateKey, vars)
  if (!text) return false

  const result = await sendMessage(telegramId, text, {
    reply_markup: keyboard([[{ text: '💳 Продлить подписку', callback_data: 'pay_start' }]]),
  })

  await logMessage(
    telegramId,
    templateKey,
    text,
    result.ok ? 'sent' : 'failed',
    result.result?.message_id,
    result.error,
    vars
  )

  return result.ok
}

/** Notify user that their payment receipt was received and is under review */
export async function notifyReceiptReceived(telegramId: number): Promise<boolean> {
  const text = await renderTemplate('payment_pending')
  if (!text) return false

  const result = await sendMessage(telegramId, text)
  await logMessage(telegramId, 'payment_pending', text, result.ok ? 'sent' : 'failed', result.result?.message_id, result.error)
  return result.ok
}

/** Notify user that payment was confirmed */
export async function notifyPaymentConfirmed(
  telegramId: number,
  endsAt: string,
  planName: string
): Promise<boolean> {
  const text = await renderTemplate('payment_confirmed', { ends_at: endsAt, plan_name: planName })
  if (!text) return false

  const result = await sendMessage(telegramId, text)
  await logMessage(telegramId, 'payment_confirmed', text, result.ok ? 'sent' : 'failed', result.result?.message_id, result.error)
  return result.ok
}

/** Notify user that payment was rejected */
export async function notifyPaymentRejected(
  telegramId: number,
  adminNote: string
): Promise<boolean> {
  const text = await renderTemplate('payment_rejected', { admin_note: adminNote || '' })
  if (!text) return false

  const result = await sendMessage(telegramId, text)
  await logMessage(telegramId, 'payment_rejected', text, result.ok ? 'sent' : 'failed', result.result?.message_id, result.error)
  return result.ok
}

/** Notify super_admin(s) of a new payment receipt */
export async function notifyAdminNewReceipt(receipt: {
  id: string
  company_name: string
  amount: number
  currency: string
  months: number
  plan_name?: string
  telegram_username?: string
}): Promise<void> {
  const supabase = serviceClient()

  // Find all super_admins with linked Telegram
  const { data: admins } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('role', 'super_admin')

  if (!admins?.length) return

  const adminUserIds = admins.map(a => a.user_id)

  const { data: tgAccounts } = await supabase
    .from('telegram_accounts')
    .select('telegram_id')
    .in('user_id', adminUserIds)
    .not('telegram_id', 'is', null)
    .eq('active', true)
    .not('confirmed_at', 'is', null)

  if (!tgAccounts?.length) return

  const text =
    `💳 *Новая заявка на оплату*\n\n` +
    `🏪 Компания: *${receipt.company_name}*\n` +
    `📦 Тариф: ${receipt.plan_name ?? '—'}\n` +
    `📅 Период: ${receipt.months} мес.\n` +
    `💰 Сумма: ${receipt.amount.toLocaleString()} ${receipt.currency}\n` +
    (receipt.telegram_username ? `📱 Telegram: @${receipt.telegram_username}\n` : '') +
    `\nID: \`${receipt.id}\``

  const kb = keyboard([
    [
      { text: '✅ Подтвердить', callback_data: `approve_receipt:${receipt.id}` },
      { text: '❌ Отклонить', callback_data: `reject_receipt:${receipt.id}` },
    ],
  ])

  for (const tg of tgAccounts) {
    if (!tg.telegram_id) continue
    const result = await sendMessage(tg.telegram_id, text, { reply_markup: kb })
    await logMessage(
      tg.telegram_id,
      'admin_receipt_notify',
      text,
      result.ok ? 'sent' : 'failed',
      result.result?.message_id,
      result.error,
      { receipt_id: receipt.id }
    )
  }
}

/** Broadcast a free-form message to a list of telegram_ids */
export async function broadcastMessage(
  telegramIds: number[],
  text: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const tid of telegramIds) {
    const result = await sendMessage(tid, text)
    await logMessage(tid, 'broadcast', text, result.ok ? 'sent' : 'failed', result.result?.message_id, result.error)
    if (result.ok) sent++
    else failed++
    // Respect Telegram's 30 msg/s limit for bots
    await new Promise(r => setTimeout(r, 40))
  }

  return { sent, failed }
}