/**
 * app/api/telegram/webhook/route.ts
 *
 * Telegram Bot Webhook — единая точка входа всех входящих сообщений.
 * Обрабатывает: команды, кнопки меню, callback-кнопки, загрузку чеков.
 *
 * Архитектура: stateless handler + Supabase service role.
 * Безопасность: проверяет секретный токен в заголовке X-Telegram-Bot-Api-Secret-Token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMessage, answerCallback, getFile, keyboard } from '@/lib/telegram/bot'
import { fetchOwnerReport, fetchBranchReport, getReportRange } from '@/lib/telegram/reports'

// ─── Supabase service client ─────────────────────────────────────────────────

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ─── Главное меню (ReplyKeyboard) ────────────────────────────────────────────

const MAIN_MENU = {
  keyboard: [
    [{ text: '📊 Статистика сегодня' }, { text: '📅 Выбрать период' }],
    [{ text: '💳 Подписка и оплата' }, { text: '⚙️ Настройки' }],
    [{ text: '❓ Помощь' }],
  ],
  resize_keyboard: true,
  persistent: true,
}

// ─── Типы Telegram Update ────────────────────────────────────────────────────

interface TgUser { id: number; username?: string; first_name?: string }
interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number }
  text?: string
  photo?: { file_id: string }[]
  document?: { file_id: string; mime_type?: string }
}
interface TgCallbackQuery {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}
interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

// ─── Lookup: найти профиль по telegram_id ────────────────────────────────────

async function findProfile(telegramId: number) {
  const supabase = db()
  const { data: tg } = await supabase
    .from('telegram_accounts')
    .select('user_id, confirmed_at, active')
    .eq('telegram_id', telegramId)
    .single()

  if (!tg || !tg.confirmed_at || !tg.active) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, role, company_id, branch_id, full_name')
    .eq('user_id', tg.user_id)
    .single()

  return profile ?? null
}

// ─── Lookup: подписка компании ────────────────────────────────────────────────

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

// ─── Lookup: тарифные планы ───────────────────────────────────────────────────

async function getPlans() {
  const supabase = db()
  const { data } = await supabase
    .from('subscription_plans')
    .select('id, name, months, price, currency')
    .eq('active', true)
    .order('months')
  return data ?? []
}

// ─── Lookup: реквизиты оплаты ─────────────────────────────────────────────────

async function getPaymentSettings() {
  const supabase = db()
  const { data } = await supabase
    .from('payment_settings')
    .select('card_number, card_holder, bank_name, payment_note, currency')
    .eq('active', true)
    .single()
  return data
}

// ─── Генерация отчёта по роли ─────────────────────────────────────────────────

async function buildReport(profile: NonNullable<Awaited<ReturnType<typeof findProfile>>>, period: string) {
  const supabase = db()
  const periodMap: Record<string, import('@/lib/telegram/reports').ReportPeriod> = {
    today: 'today',
    yesterday: 'yesterday',
    week: '7d',
    '7d': '7d',
    month: 'month',
    '30d': '30d',
    prev_month: 'prev_month',
  }
  const p = periodMap[period] ?? 'today'
  const range = getReportRange(p)

  if (profile.role === 'branch_manager' && profile.branch_id) {
    return await fetchBranchReport(supabase, profile.branch_id, range)
  }

  if ((profile.role === 'owner' || profile.role === 'super_admin') && profile.company_id) {
    return await fetchOwnerReport(supabase, profile.company_id, range)
  }

  return null
}

// ─── Состояние ожидания чека (in-memory, достаточно для MVP) ─────────────────
// Для production лучше хранить в Redis/Supabase, но для начала достаточно.

const pendingReceipt = new Map<number, { receiptId: string }>()

// ─── Обработчик команд и текстовых сообщений ─────────────────────────────────

async function handleMessage(msg: TgMessage) {
  const chatId = msg.chat.id
  const telegramId = msg.from?.id
  if (!telegramId) return

  // Обработка загрузки чека (фото или документ)
  if (pendingReceipt.has(telegramId) && (msg.photo || msg.document)) {
    await handleReceiptUpload(chatId, telegramId, msg)
    return
  }

  const text = (msg.text ?? '').trim()

  // ─── /start ──────────────────────────────────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    const token = text.split(' ')[1]
    if (token) {
      await handleLinkToken(chatId, telegramId, msg.from!, token)
    } else {
      await handleStart(chatId, telegramId)
    }
    return
  }

  // ─── Команды ─────────────────────────────────────────────────────────────
  const commandMap: Record<string, string> = {
    '/today': 'today',
    '/yesterday': 'yesterday',
    '/week': '7d',
    '/month': 'month',
    '/report': 'today',
    '📊 Статистика сегодня': 'today',
  }

  if (commandMap[text] !== undefined) {
    await handleReport(chatId, telegramId, commandMap[text])
    return
  }

  // ─── Меню периодов ───────────────────────────────────────────────────────
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

  // ─── Подписка и оплата ───────────────────────────────────────────────────
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

// ─── /start без токена ────────────────────────────────────────────────────────

async function handleStart(chatId: number, telegramId: number) {
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

// ─── Привязка по токену (/start TOKEN) ───────────────────────────────────────

async function handleLinkToken(chatId: number, telegramId: number, tgUser: TgUser, token: string) {
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

// ─── Отчёт ───────────────────────────────────────────────────────────────────

async function handleReport(chatId: number, telegramId: number, period: string) {
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

// ─── Подписка и оплата ────────────────────────────────────────────────────────

async function handleSubscriptionMenu(chatId: number, telegramId: number) {
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
      [{ text: '🔙 Главное меню', callback_data: 'main_menu' }],
    ]),
  })
}

// ─── Настройки ───────────────────────────────────────────────────────────────

async function handleSettings(chatId: number, telegramId: number) {
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
        [{ text: '🔙 Главное меню', callback_data: 'main_menu' }],
      ]),
    }
  )
}

// ─── Помощь ──────────────────────────────────────────────────────────────────

async function handleHelp(chatId: number) {
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

// ─── Выбор плана оплаты ──────────────────────────────────────────────────────

async function handlePayStart(chatId: number, telegramId: number) {
  const plans = await getPlans()

  if (!plans.length) {
    await sendMessage(chatId, '⚠️ Тарифные планы не настроены. Обратитесь к администратору.')
    return
  }

  const buttons = plans.map(p => [{
    text: `${p.name} — ${p.price.toLocaleString()} ${p.currency}`,
    callback_data: `pay_plan:${p.id}`,
  }])
  buttons.push([{ text: '🔙 Назад', callback_data: 'sub_menu' }])

  await sendMessage(chatId,
    `💳 *Оплата подписки*\n\n` +
    `Выберите период подписки:`,
    { reply_markup: keyboard(buttons) }
  )
}

// ─── Показать реквизиты выбранного плана ─────────────────────────────────────

async function handlePayPlan(chatId: number, telegramId: number, planId: string) {
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

  // Сохраняем выбранный план в pending_receipts (черновик)
  const profile = await findProfile(telegramId)
  if (profile?.company_id) {
    await supabase.from('payment_receipts').insert({
      company_id: profile.company_id,
      user_id: profile.user_id,
      plan_id: planId,
      amount: plan.price,
      currency: plan.currency,
      months: plan.months,
      status: 'awaiting_receipt',
    }).select('id').single().then(({ data }) => {
      if (data?.id) pendingReceipt.set(telegramId, { receiptId: data.id })
    })
  }

  await sendMessage(chatId, text, {
    reply_markup: keyboard([
      [{ text: '✅ Я оплатил — отправить чек', callback_data: `pay_confirm:${planId}` }],
      [{ text: '❌ Отмена', callback_data: 'pay_start' }],
    ]),
  })
}

// ─── Запрос чека ─────────────────────────────────────────────────────────────

async function handlePayConfirmRequest(chatId: number, telegramId: number, planId: string) {
  await sendMessage(chatId,
    `📸 *Отправьте фото или скриншот чека*\n\n` +
    `Поддерживаются: фото, PDF, скриншот.\n` +
    `После отправки чека заявка будет передана на проверку администратору.\n\n` +
    `⚠️ Подписка активируется только после ручного подтверждения.`
  )
  // Отмечаем что ждём чек (если не установлен из pay_plan)
  if (!pendingReceipt.has(telegramId)) {
    pendingReceipt.set(telegramId, { receiptId: planId })
  }
}

// ─── Обработка загруженного чека ─────────────────────────────────────────────

async function handleReceiptUpload(chatId: number, telegramId: number, msg: TgMessage) {
  const supabase = db()
  const pending = pendingReceipt.get(telegramId)
  pendingReceipt.delete(telegramId)

  // Получаем file_id
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

  // Обновляем запись чека
  if (pending?.receiptId) {
    await supabase
      .from('payment_receipts')
      .update({
        receipt_file_id: fileId,
        receipt_url: fileUrl,
        status: 'pending_review',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', pending.receiptId)
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

  if (profile?.company_id && pending?.receiptId) {
    const { data: receipt } = await supabase
      .from('payment_receipts')
      .select('amount, currency, months, plan_name:subscription_plans(name)')
      .eq('id', pending.receiptId)
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
        id: pending.receiptId,
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

async function handlePayHistory(chatId: number, telegramId: number) {
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
      reply_markup: keyboard([[{ text: '🔙 Назад', callback_data: 'sub_menu' }]]),
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
      [{ text: '🔙 Назад', callback_data: 'sub_menu' }],
    ]),
  })
}

// ─── Admin: подтвердить/отклонить оплату ─────────────────────────────────────

async function handleAdminApprove(callbackId: string, adminTelegramId: number, receiptId: string) {
  // Проверить что это super_admin
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

  // Продлить подписку
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

  // Обновить чек
  await supabase
    .from('payment_receipts')
    .update({ status: 'approved', reviewed_at: now.toISOString() })
    .eq('id', receiptId)

  await answerCallback(callbackId, '✅ Оплата подтверждена!')

  // Уведомить пользователя
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

async function handleAdminReject(callbackId: string, adminTelegramId: number, receiptId: string) {
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
        reply_markup: keyboard([
          [{ text: '💳 Попробовать снова', callback_data: 'pay_start' }],
        ]),
      }
    )
  }
}

// ─── Обработчик callback-кнопок ──────────────────────────────────────────────

async function handleCallback(cb: TgCallbackQuery) {
  const chatId = cb.message?.chat.id
  if (!chatId) return

  const telegramId = cb.from.id
  const data = cb.data ?? ''

  // report:period
  if (data.startsWith('report:')) {
    await answerCallback(cb.id)
    await handleReport(chatId, telegramId, data.split(':')[1])
    return
  }

  // sub_menu — подписка
  if (data === 'sub_menu') {
    await answerCallback(cb.id)
    await handleSubscriptionMenu(chatId, telegramId)
    return
  }

  // pay_start — выбор плана
  if (data === 'pay_start') {
    await answerCallback(cb.id)
    await handlePayStart(chatId, telegramId)
    return
  }

  // pay_plan:id — выбран конкретный план
  if (data.startsWith('pay_plan:')) {
    await answerCallback(cb.id)
    await handlePayPlan(chatId, telegramId, data.split(':')[1])
    return
  }

  // pay_confirm:planId — просим отправить чек
  if (data.startsWith('pay_confirm:')) {
    await answerCallback(cb.id)
    await handlePayConfirmRequest(chatId, telegramId, data.split(':')[1])
    return
  }

  // pay_history
  if (data === 'pay_history') {
    await answerCallback(cb.id)
    await handlePayHistory(chatId, telegramId)
    return
  }

  // approve_receipt:id
  if (data.startsWith('approve_receipt:')) {
    await handleAdminApprove(cb.id, telegramId, data.split(':')[1])
    return
  }

  // reject_receipt:id
  if (data.startsWith('reject_receipt:')) {
    await handleAdminReject(cb.id, telegramId, data.split(':')[1])
    return
  }

  // main_menu
  if (data === 'main_menu') {
    await answerCallback(cb.id)
    await sendMessage(chatId, '🏠 Главное меню:', { reply_markup: MAIN_MENU })
    return
  }

  await answerCallback(cb.id, 'Неизвестная команда')
}

// ─── POST /api/telegram/webhook ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Проверка секретного токена
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TgUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    if (update.message) {
      await handleMessage(update.message)
    } else if (update.callback_query) {
      await handleCallback(update.callback_query)
    }
  } catch (err) {
    console.error('[webhook] unhandled error:', err)
  }

  // Telegram ждёт 200 OK в любом случае
  return NextResponse.json({ ok: true })
}

// ─── GET /api/telegram/webhook — health check ────────────────────────────────

export async function GET() {
  return NextResponse.json({ ok: true, message: 'BirTapCard Telegram Webhook is running' })
}