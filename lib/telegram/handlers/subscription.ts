/**
 * lib/telegram/handlers/subscription.ts
 *
 * Подписка: статус, выбор тарифа, реквизиты, приём чека, история оплат.
 *
 * Phase 0 fix: ожидание чека больше не хранится в in-memory Map (которая
 * слетала при холодном старте serverless-функции) — теперь это персистентный
 * bot_state в Supabase через lib/telegram/db.ts (setState/getState/clearState).
 */

import { sendMessage, getFile, keyboard } from '@/lib/telegram/bot'
import { db, findProfile, setState, getState, clearState } from '@/lib/telegram/db'
import { navRow } from '@/lib/telegram/keyboards/main'
import type { TgMessage } from '@/lib/telegram/types'

const RECEIPT_STATE = 'awaiting_receipt'

// ─── Lookups ───────────────────────────────────────────────────────────────

async function getSubscription(companyId: string) {
  const supabase = db()
  const { data } = await supabase
    .from('subscriptions')
    .select('status, ends_at, plan_name, trial_ends_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getPlans() {
  const supabase = db()
  const { data } = await supabase
    .from('subscription_plans')
    .select('id, name, months, price, currency')
    .eq('active', true)
    .order('months')
  return data ?? []
}

async function getPaymentSettings() {
  const supabase = db()
  const { data } = await supabase
    .from('payment_settings')
    .select('card_number, card_holder, bank_name, payment_note, currency')
    .eq('active', true)
    .single()
  return data
}

/** Используется router'ом, чтобы понять — ждём ли мы от этого пользователя фото чека */
export async function isAwaitingReceipt(telegramId: number): Promise<boolean> {
  const state = await getState(telegramId)
  return state?.state === RECEIPT_STATE
}

// ─── Меню подписки ───────────────────────────────────────────────────────────

export async function handleSubscriptionMenu(chatId: number, telegramId: number) {
  const profile = await findProfile(telegramId)
  if (!profile) {
    await sendMessage(chatId, '⚠️ Аккаунт не привязан.')
    return
  }

  if (!profile.company_id) {
    await sendMessage(chatId, '⚠️ Ваш аккаунт не привязан к компании. Обратитесь к администратору.')
    return
  }

  const sub = await getSubscription(profile.company_id)

  const statusEmoji: Record<string, string> = {
    active: '✅',
    trial: '🔔',
    pending_payment: '⏳',
    expired: '❌',
    suspended: '⛔',
    cancelled: '🚫',
  }

  const statusLabel: Record<string, string> = {
    active: 'Активна',
    trial: 'Пробный период',
    pending_payment: 'Ожидает оплаты',
    expired: 'Истекла',
    suspended: 'Приостановлена',
    cancelled: 'Отменена',
  }

  let text = `💳 *Ваша подписка*\n\n`

  if (!sub) {
    text += `❌ Подписка не найдена.\n\nСвяжитесь с поддержкой или оплатите подписку.`
  } else {
    const emoji = statusEmoji[sub.status] ?? '❓'
    const label = statusLabel[sub.status] ?? sub.status
    const endsAt = sub.ends_at
      ? new Date(sub.ends_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—'

    text += `📦 Тариф: *${sub.plan_name ?? 'Стандарт'}*\n`
    text += `${emoji} Статус: *${label}*\n`
    text += `📅 Действует до: *${endsAt}*\n`

    if (sub.status === 'trial' && sub.trial_ends_at) {
      const trialEnd = new Date(sub.trial_ends_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
      text += `⏰ Пробный период до: *${trialEnd}*\n`
    }
  }

  text += `\nВыберите действие:`

  await sendMessage(chatId, text, {
    reply_markup: keyboard([
      [{ text: '💳 Оплатить / Продлить', callback_data: 'pay_start' }],
      [{ text: '📋 История оплат', callback_data: 'pay_history' }],
      navRow(),
    ]),
  })
}

// ─── Выбор плана оплаты ──────────────────────────────────────────────────────

export async function handlePayStart(chatId: number) {
  const plans = await getPlans()

  if (!plans.length) {
    await sendMessage(chatId, '⚠️ Тарифные планы не настроены. Обратитесь к администратору.')
    return
  }

  const buttons = plans.map(p => [{
    text: `${p.name} — ${p.price.toLocaleString()} ${p.currency}`,
    callback_data: `pay_plan:${p.id}`,
  }])
  buttons.push(navRow('sub_menu'))

  await sendMessage(chatId,
    `💳 *Оплата подписки*\n\n` +
    `Выберите период подписки:`,
    { reply_markup: keyboard(buttons) }
  )
}

// ─── Показать реквизиты выбранного плана ─────────────────────────────────────

export async function handlePayPlan(chatId: number, telegramId: number, planId: string) {
  const supabase = db()

  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('id, name, months, price, currency')
    .eq('id', planId)
    .single()

  if (!plan) {
    await sendMessage(chatId, '❌ Тариф не найден.')
    return
  }

  const settings = await getPaymentSettings()

  let text = `💳 *Оплата: ${plan.name}*\n\n`
  text += `💰 Сумма: *${plan.price.toLocaleString()} ${plan.currency}*\n`
  text += `📅 Период: *${plan.months} мес.*\n\n`

  if (settings) {
    text += `📋 *Реквизиты для оплаты:*\n`
    text += `💳 Карта: \`${settings.card_number}\`\n`
    text += `👤 Получатель: *${settings.card_holder}*\n`
    if (settings.bank_name) text += `🏦 Банк: ${settings.bank_name}\n`
    if (settings.payment_note) text += `📝 Назначение: _${settings.payment_note}_\n`
  } else {
    text += `⚠️ Реквизиты временно недоступны. Обратитесь к поддержке.`
  }

  text += `\n\nПосле оплаты нажмите *"Я оплатил"* и отправьте фото/скриншот чека.`

  // Сохраняем выбранный план как черновик заявки и переводим пользователя
  // в персистентное состояние "ждём чек" (переживает рестарт функции)
  const profile = await findProfile(telegramId)
  if (profile?.company_id) {
    const { data } = await supabase
      .from('payment_receipts')
      .insert({
        company_id: profile.company_id,
        user_id: profile.user_id,
        plan_id: planId,
        amount: plan.price,
        currency: plan.currency,
        months: plan.months,
        status: 'awaiting_receipt',
      })
      .select('id')
      .single()

    if (data?.id) {
      await setState(telegramId, RECEIPT_STATE, { receiptId: data.id })
    }
  }

  await sendMessage(chatId, text, {
    reply_markup: keyboard([
      [{ text: '✅ Я оплатил — отправить чек', callback_data: `pay_confirm:${planId}` }],
      [{ text: '❌ Отмена', callback_data: 'pay_start' }],
    ]),
  })
}

// ─── Запрос чека ─────────────────────────────────────────────────────────────

export async function handlePayConfirmRequest(chatId: number, telegramId: number, planId: string) {
  await sendMessage(chatId,
    `📸 *Отправьте фото или скриншот чека*\n\n` +
    `Поддерживаются: фото, PDF, скриншот.\n` +
    `После отправки чека заявка будет передана на проверку администратору.\n\n` +
    `⚠️ Подписка активируется только после ручного подтверждения.`
  )
  // Если черновик чека ещё не создан (handlePayPlan не успел/не смог) — отмечаем хотя бы planId
  if (!(await isAwaitingReceipt(telegramId))) {
    await setState(telegramId, RECEIPT_STATE, { receiptId: planId })
  }
}

// ─── Обработка загруженного чека ─────────────────────────────────────────────

export async function handleReceiptUpload(chatId: number, telegramId: number, msg: TgMessage) {
  const supabase = db()
  const state = await getState(telegramId)
  await clearState(telegramId)
  const receiptId = state?.payload?.receiptId as string | undefined

  let fileId: string | undefined
  if (msg.photo?.length) {
    fileId = msg.photo[msg.photo.length - 1].file_id
  } else if (msg.document) {
    fileId = msg.document.file_id
  }

  if (!fileId) {
    await sendMessage(chatId, '❌ Не удалось получить файл. Попробуйте снова.')
    return
  }

  const fileUrl = await getFile(fileId)

  if (receiptId) {
    await supabase
      .from('payment_receipts')
      .update({
        receipt_file_id: fileId,
        receipt_url: fileUrl,
        status: 'pending_review',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', receiptId)
  }

  await sendMessage(chatId,
    `✅ *Чек получен!*\n\n` +
    `Ваша заявка передана на проверку.\n` +
    `Администратор проверит оплату в течение рабочего дня и уведомит вас.\n\n` +
    `⏳ Статус: _Ожидает проверки_`
  )

  // Уведомить super_admin
  const { notifyAdminNewReceipt } = await import('@/lib/telegram/notifications')
  const profile = await findProfile(telegramId)

  if (profile?.company_id && receiptId) {
    const { data: receipt } = await supabase
      .from('payment_receipts')
      .select('amount, currency, months, plan_name:subscription_plans(name)')
      .eq('id', receiptId)
      .single()

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .single()

    const { data: tgAcc } = await supabase
      .from('telegram_accounts')
      .select('username')
      .eq('telegram_id', telegramId)
      .single()

    if (receipt && company) {
      const planNameRaw = receipt.plan_name
      const planName = Array.isArray(planNameRaw)
        ? planNameRaw[0]?.name
        : (planNameRaw as { name?: string } | null)?.name

      await notifyAdminNewReceipt({
        id: receiptId,
        company_name: company.name,
        amount: receipt.amount,
        currency: receipt.currency,
        months: receipt.months,
        plan_name: planName,
        telegram_username: tgAcc?.username,
      })
    }
  }
}

// ─── История оплат ───────────────────────────────────────────────────────────

export async function handlePayHistory(chatId: number, telegramId: number) {
  const profile = await findProfile(telegramId)
  if (!profile?.company_id) {
    await sendMessage(chatId, '⚠️ Аккаунт не привязан к компании.')
    return
  }

  const supabase = db()
  const { data: receipts } = await supabase
    .from('payment_receipts')
    .select('amount, currency, months, status, submitted_at, subscription_plans(name)')
    .eq('company_id', profile.company_id)
    .order('submitted_at', { ascending: false })
    .limit(5)

  if (!receipts?.length) {
    await sendMessage(chatId, '📋 История оплат пуста.', {
      reply_markup: keyboard([navRow('sub_menu')]),
    })
    return
  }

  const statusEmoji: Record<string, string> = {
    pending_review: '⏳',
    approved: '✅',
    rejected: '❌',
    awaiting_receipt: '📸',
  }

  let text = `📋 *История оплат* (последние 5)\n\n`

  for (const r of receipts) {
    const date = r.submitted_at
      ? new Date(r.submitted_at).toLocaleDateString('ru-RU')
      : '—'
    const planName = Array.isArray(r.subscription_plans)
      ? r.subscription_plans[0]?.name
      : (r.subscription_plans as { name?: string } | null)?.name
    const emoji = statusEmoji[r.status] ?? '❓'
    text += `${emoji} ${planName ?? r.months + ' мес.'} — ${r.amount.toLocaleString()} ${r.currency}\n`
    text += `   📅 ${date} · _${r.status}_\n\n`
  }

  await sendMessage(chatId, text, {
    reply_markup: keyboard([
      [{ text: '💳 Оплатить', callback_data: 'pay_start' }],
      navRow('sub_menu'),
    ]),
  })
}
