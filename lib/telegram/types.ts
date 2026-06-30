/**
 * lib/telegram/types.ts
 *
 * Общие типы Telegram Update API, используемые во всех модулях бота.
 * Единственный источник истины для форм входящих апдейтов.
 */

export interface TgUser {
  id: number
  username?: string
  first_name?: string
}

export interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number }
  text?: string
  photo?: { file_id: string }[]
  document?: { file_id: string; mime_type?: string }
}

export interface TgCallbackQuery {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}
