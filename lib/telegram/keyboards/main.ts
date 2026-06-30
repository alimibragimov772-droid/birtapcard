/**
 * lib/telegram/keyboards/main.ts
 *
 * Reply- и inline-клавиатуры общего назначения.
 *
 * ВАЖНО (Phase 0): здесь пока один общий MAIN_MENU для всех ролей — это
 * временно. В Phase 1 он будет заменён на ownerMenu()/branchMenu()/adminMenu()
 * в зависимости от profile.role, а этот файл останется источником для
 * переиспользуемых элементов (backButton, mainMenuButton, breadcrumb-хелперы).
 */

import type { ReplyMarkup, InlineButton } from '@/lib/telegram/bot'

export const MAIN_MENU: ReplyMarkup = {
  keyboard: [
    [{ text: '📊 Статистика сегодня' }, { text: '📅 Выбрать период' }],
    [{ text: '💳 Подписка и оплата' }, { text: '⚙️ Настройки' }],
    [{ text: '❓ Помощь' }],
  ],
  resize_keyboard: true,
  persistent: true,
}

/** Универсальная кнопка "Назад" — destination это callback_data раздела, куда вернуться */
export function backButton(destination: string, label = '🔙 Назад'): InlineButton {
  return { text: label, callback_data: destination }
}

/** Универсальная кнопка "Главное меню" — всегда callback_data === 'main_menu' */
export function mainMenuButton(label = '🏠 Главное меню'): InlineButton {
  return { text: label, callback_data: 'main_menu' }
}

/** Строка навигации: [Назад] [Главное меню] — для низа любого экрана с подразделами */
export function navRow(backTo?: string): InlineButton[] {
  return backTo ? [backButton(backTo), mainMenuButton()] : [mainMenuButton()]
}
