/**
 * lib/telegram/handlers/comingSoon.ts
 *
 * Заглушка для разделов меню, которые уже видны в навигации (кнопка есть
 * у роли с первого дня — это специально, чтобы структура меню не менялась
 * визуально между фазами), но логика появится в следующей фазе. Каждое
 * такое место в router.ts помечено комментарием с номером фазы.
 */

import { sendMessage, keyboard } from '@/lib/telegram/bot'
import { navRow } from '@/lib/telegram/keyboards/main'

export async function comingSoon(chatId: number, title: string, phase: string) {
  await sendMessage(chatId,
    `🚧 *${title}*\n\n` +
    `Этот раздел появится в ${phase}.\n` +
    `Сейчас доступна основная статистика и подписка — смотрите остальные кнопки меню.`,
    { reply_markup: keyboard([navRow()]) }
  )
}
