/**
 * app/api/telegram/webhook/route.ts
 *
 * Telegram Bot Webhook — единая точка входа всех входящих сообщений.
 *
 * Это тонкий HTTP-слой: проверка секрета и передача апдейта в роутеры.
 * Вся бизнес-логика живёт в lib/telegram/* (router.ts для сообщений,
 * callbacks/router.ts для inline-кнопок, handlers/* для конкретных экранов).
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleMessage } from '@/lib/telegram/router'
import { handleCallback } from '@/lib/telegram/callbacks/router'
import type { TgUpdate } from '@/lib/telegram/types'

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
