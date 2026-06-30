/**
 * lib/telegram/keyboards/menus.ts
 *
 * Главные Reply-меню под каждую роль. Это то, что пользователь видит
 * постоянно внизу экрана после /start — единственный источник истины
 * для состава кнопок каждой роли.
 *
 * Разделы, помеченные как "coming soon" в router.ts, наполнятся реальной
 * логикой в следующих фазах (2: owner, 4: super_admin, 5: уведомления,
 * 6: поддержка) — кнопки уже на месте, чтобы навигация не менялась
 * визуально между фазами.
 */

import type { ReplyMarkup } from '@/lib/telegram/bot'
import type { BotProfile } from '@/lib/telegram/db'

export function superAdminMenu(): ReplyMarkup {
  return {
    keyboard: [
      [{ text: '📊 Статистика платформы' }, { text: '🏢 Компании' }],
      [{ text: '🍽 Рестораны' }, { text: '🏪 Филиалы' }],
      [{ text: '👥 Пользователи' }, { text: '💳 Подписки' }],
      [{ text: '💰 Оплаты' }, { text: '📩 Новые чеки' }],
      [{ text: '📢 Рассылка' }, { text: '🤖 Telegram' }],
      [{ text: '📈 Аналитика' }, { text: '⚙ Настройки' }],
    ],
    resize_keyboard: true,
    persistent: true,
  }
}

export function ownerMenu(): ReplyMarkup {
  return {
    keyboard: [
      [{ text: '📊 Сегодня' }, { text: '📈 Аналитика' }],
      [{ text: '🏪 Мои филиалы' }, { text: '🏆 Рейтинг филиалов' }],
      [{ text: '💳 Подписка' }, { text: '📄 Скачать отчёт' }],
      [{ text: '🔔 Уведомления' }, { text: '🆘 Поддержка' }],
    ],
    resize_keyboard: true,
    persistent: true,
  }
}

export function branchMenu(): ReplyMarkup {
  return {
    keyboard: [
      [{ text: '📊 Сегодня' }, { text: '📈 Статистика' }],
      [{ text: '📄 Отчёт' }, { text: 'ℹ Информация' }],
    ],
    resize_keyboard: true,
    persistent: true,
  }
}

/** Единая точка выбора меню по роли — используется во всех handlers/router */
export function menuForRole(role: BotProfile['role'] | undefined | null): ReplyMarkup {
  if (role === 'super_admin') return superAdminMenu()
  if (role === 'branch_manager') return branchMenu()
  return ownerMenu()
}
