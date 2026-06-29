/**
 * lib/telegram/db.ts
 *
 * Supabase service-role клиент для всех модулей Telegram-бота.
 * Единственный файл, импортирующий service_role key внутри lib/telegram/*.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ─── Типы профиля ─────────────────────────────────────────────────────────────

export interface BotProfile {
  user_id: string
  role: 'super_admin' | 'owner' | 'branch_manager'
  company_id: string | null
  branch_id: string | null
  full_name: string | null
}

// ─── Поиск профиля по Telegram ID ────────────────────────────────────────────

export async function findProfile(telegramId: number): Promise<BotProfile | null> {
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

  if (!profile) return null

  return {
    user_id: profile.user_id,
    role: profile.role as BotProfile['role'],
    company_id: profile.company_id ?? null,
    branch_id: profile.branch_id ?? null,
    full_name: profile.full_name ?? null,
  }
}

// ─── Управление состоянием бота (персистентное, через БД) ────────────────────

export async function setState(
  telegramId: number,
  state: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const supabase = db()
  await supabase.from('bot_state').upsert({
    telegram_id: telegramId,
    state,
    payload: payload ?? null,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' })
}

export async function getState(
  telegramId: number
): Promise<{ state: string; payload: Record<string, unknown> | null } | null> {
  const supabase = db()
  const { data } = await supabase
    .from('bot_state')
    .select('state, payload, expires_at')
    .eq('telegram_id', telegramId)
    .single()

  if (!data) return null
  if (new Date(data.expires_at) < new Date()) {
    await clearState(telegramId)
    return null
  }

  return { state: data.state, payload: data.payload as Record<string, unknown> | null }
}

export async function clearState(telegramId: number): Promise<void> {
  const supabase = db()
  await supabase.from('bot_state').delete().eq('telegram_id', telegramId)
}

// ─── Лог сообщений ───────────────────────────────────────────────────────────

export async function logMessage(
  telegramId: number,
  messageType: string,
  textSent: string,
  status: 'sent' | 'failed',
  telegramMsgId?: number,
  errorMessage?: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const supabase = db()
  await supabase.from('telegram_messages').insert({
    telegram_id: telegramId,
    message_type: messageType,
    text_sent: textSent,
    status,
    telegram_msg_id: telegramMsgId ?? null,
    error_message: errorMessage ?? null,
    payload: payload ?? null,
  })
}