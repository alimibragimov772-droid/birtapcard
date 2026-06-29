/**
 * lib/telegram/bot.ts
 *
 * Core Telegram Bot API wrapper.
 * All bot interactions go through this module — single source of truth.
 * Supports: sendMessage, sendPhoto, editMessage, answerCallback,
 *           forwardMessage, getFile, buildInlineKeyboard.
 */

const TELEGRAM_API = 'https://api.telegram.org'

function botUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return `${TELEGRAM_API}/bot${token}/${method}`
}

export interface InlineButton {
  text: string
  callback_data?: string
  url?: string
}

export interface ReplyKeyboardButton {
  text: string
}

export interface ReplyMarkup {
  inline_keyboard?: InlineButton[][]
  keyboard?: ReplyKeyboardButton[][]
  resize_keyboard?: boolean
  persistent?: boolean
  remove_keyboard?: boolean
  one_time_keyboard?: boolean
}

export interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'HTML'
  reply_markup?: ReplyMarkup
  disable_web_page_preview?: boolean
}

/** Send a plain or formatted text message */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {}
): Promise<{ ok: boolean; result?: { message_id: number }; error?: string }> {
  try {
    const res = await fetch(botUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode ?? 'Markdown',
        reply_markup: options.reply_markup,
        disable_web_page_preview: options.disable_web_page_preview ?? true,
      }),
    })
    const json = await res.json()
    if (!json.ok) return { ok: false, error: json.description }
    return { ok: true, result: json.result }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/** Edit an existing message text */
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  options: SendMessageOptions = {}
): Promise<boolean> {
  try {
    const res = await fetch(botUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options.parse_mode ?? 'Markdown',
        reply_markup: options.reply_markup,
        disable_web_page_preview: true,
      }),
    })
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

/** Answer a callback query (dismiss the loading spinner on inline buttons) */
export async function answerCallback(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<void> {
  await fetch(botUrl('answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
  })
}

/** Send a photo with an optional caption */
export async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string,
  options: SendMessageOptions = {}
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  try {
    const res = await fetch(botUrl('sendPhoto'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'Markdown',
        reply_markup: options.reply_markup,
      }),
    })
    const json = await res.json()
    return { ok: json.ok === true, result: json.result }
  } catch {
    return { ok: false }
  }
}

/** Get a file path from Telegram (for downloading receipts) */
export async function getFile(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(botUrl('getFile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    })
    const json = await res.json()
    if (!json.ok) return null
    const token = process.env.TELEGRAM_BOT_TOKEN!
    return `${TELEGRAM_API}/file/bot${token}/${json.result.file_path}`
  } catch {
    return null
  }
}

/** Set webhook URL */
export async function setWebhook(url: string): Promise<boolean> {
  const res = await fetch(botUrl('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, drop_pending_updates: true }),
  })
  const json = await res.json()
  return json.ok === true
}

/** Build inline keyboard from 2D array shorthand */
export function keyboard(rows: InlineButton[][]): { inline_keyboard: InlineButton[][] } {
  return { inline_keyboard: rows }
}