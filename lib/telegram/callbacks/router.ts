/**
 * lib/telegram/callbacks/router.ts
 *
 * Единая точка маршрутизации inline-callback'ов (callback_data).
 * Вместо длинной цепочки if/else — таблица префиксов. Каждый новый раздел
 * (Phase 1+: owner/branch/admin модули) регистрирует здесь свой префикс,
 * не трогая остальной код.
 */

import { sendMessage, answerCallback } from '@/lib/telegram/bot'
import { findProfile } from '@/lib/telegram/db'
import { menuForRole } from '@/lib/telegram/keyboards/menus'
import type { TgCallbackQuery } from '@/lib/telegram/types'
import { handleReport, handleCustomRangeRequest } from '@/lib/telegram/handlers/report'
import {
  handleSubscriptionMenu,
  handlePayStart,
  handlePayPlan,
  handlePayConfirmRequest,
  handlePayHistory,
} from '@/lib/telegram/handlers/subscription'
import { handleAdminApprove, handleAdminReject } from '@/lib/telegram/handlers/admin'
import { handleBranchRanking } from '@/lib/telegram/handlers/branches'
import { handleExportReport } from '@/lib/telegram/handlers/export'

/**
 * Точные совпадения callback_data → обработчик.
 */
const EXACT_ROUTES: Record<string, (chatId: number, telegramId: number, cbId: string) => Promise<void>> = {
  sub_menu: async (chatId, telegramId, cbId) => {
    await answerCallback(cbId)
    await handleSubscriptionMenu(chatId, telegramId)
  },
  pay_start: async (chatId, _telegramId, cbId) => {
    await answerCallback(cbId)
    await handlePayStart(chatId)
  },
  pay_history: async (chatId, telegramId, cbId) => {
    await answerCallback(cbId)
    await handlePayHistory(chatId, telegramId)
  },
  main_menu: async (chatId, telegramId, cbId) => {
    await answerCallback(cbId)
    const profile = await findProfile(telegramId)
    await sendMessage(chatId, '🏠 Главное меню:', { reply_markup: menuForRole(profile?.role) })
  },
}

/**
 * Префиксные маршруты вида "prefix:arg" → обработчик(chatId, telegramId, arg, cbId).
 */
const PREFIX_ROUTES: Record<string, (chatId: number, telegramId: number, arg: string, cbId: string) => Promise<void>> = {
  'report:': async (chatId, telegramId, arg, cbId) => {
    await answerCallback(cbId)
    if (arg === 'custom') {
      await handleCustomRangeRequest(chatId, telegramId)
      return
    }
    await handleReport(chatId, telegramId, arg)
  },
  'rank:': async (chatId, telegramId, arg, cbId) => {
    await answerCallback(cbId)
    await handleBranchRanking(chatId, telegramId, arg)
  },
  'export:': async (chatId, telegramId, arg, cbId) => {
    await answerCallback(cbId)
    await handleExportReport(chatId, telegramId, arg)
  },
  'pay_plan:': async (chatId, telegramId, arg, cbId) => {
    await answerCallback(cbId)
    await handlePayPlan(chatId, telegramId, arg)
  },
  'pay_confirm:': async (chatId, telegramId, arg, cbId) => {
    await answerCallback(cbId)
    await handlePayConfirmRequest(chatId, telegramId, arg)
  },
  'approve_receipt:': async (_chatId, telegramId, arg, cbId) => {
    // answerCallback вызывается внутри handleAdminApprove (текст зависит от результата)
    await handleAdminApprove(cbId, telegramId, arg)
  },
  'reject_receipt:': async (_chatId, telegramId, arg, cbId) => {
    await handleAdminReject(cbId, telegramId, arg)
  },
}

export async function handleCallback(cb: TgCallbackQuery) {
  const chatId = cb.message?.chat.id
  if (!chatId) return

  const telegramId = cb.from.id
  const data = cb.data ?? ''

  const exact = EXACT_ROUTES[data]
  if (exact) {
    await exact(chatId, telegramId, cb.id)
    return
  }

  for (const prefix of Object.keys(PREFIX_ROUTES)) {
    if (data.startsWith(prefix)) {
      const arg = data.slice(prefix.length)
      await PREFIX_ROUTES[prefix](chatId, telegramId, arg, cb.id)
      return
    }
  }

  await answerCallback(cb.id, 'Неизвестная команда')
}
