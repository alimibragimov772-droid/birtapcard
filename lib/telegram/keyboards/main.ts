/**
 * lib/telegram/keyboards/main.ts
 *
 * Переиспользуемые элементы навигации (кнопки "Назад"/"Главное меню",
 * breadcrumb-хелперы). Сами Reply-меню по ролям — в keyboards/menus.ts
 * (Phase 1: superAdminMenu/ownerMenu/branchMenu/menuForRole).
 */

import type { InlineButton } from '@/lib/telegram/bot'

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
