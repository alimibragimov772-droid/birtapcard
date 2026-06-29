import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getVisitorDevice, getClientIp, getBrowserLang, isBot } from '@/lib/visitor-hash'

export const dynamic = 'force-dynamic'

/**
 * GET /r/nfc/[token]
 *
 * Цепочка:
 *  Пользователь прикладывает телефон к NFC → попадает сюда →
 *  сервер фильтрует ботов → фиксирует событие через record_scan() →
 *  редирект на Google Reviews.
 *
 * ЗАЩИТА ОТ ДУБЛЕЙ:
 *  1. Боты (Telegram Preview, WhatsApp, Slack и т.д.) отклоняются сразу —
 *     они не являются реальными сканированиями.
 *  2. record_scan() в Postgres использует атомарный UPSERT в unique_visitors
 *     по (branch_id, visitor_hash, scan_date) — повторная запись за тот же
 *     день не создаёт новую строку в unique_visitors, is_unique остаётся false.
 *  3. Сам route вызывается ровно один раз на HTTP-запрос (нет Server Actions,
 *     нет useEffect, нет двойного fetch).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const userAgent = request.headers.get('user-agent') || ''

  // ── 1. Отклонить ботов и превью-краулеров ─────────────────────────────────
  //    Telegram, WhatsApp, Slack и другие мессенджеры автоматически открывают
  //    ссылки для генерации превью. Это НЕ реальное сканирование — если не
  //    отфильтровать, одно физическое касание NFC даёт 2+ записи в БД.
  if (isBot(userAgent)) {
    // Возвращаем пустой 200 — боты не должны видеть редирект,
    // иначе некоторые из них пойдут по redirect_url и запросят Google Maps.
    return new NextResponse(null, { status: 204 })
  }

  // ── 2. Собрать параметры реального посетителя ─────────────────────────────
  const supabase = createServiceRoleClient()
  const ip     = getClientIp(request)
  const device = getVisitorDevice(userAgent)
  const lang   = getBrowserLang(request)

  // ── 3. Атомарно зафиксировать событие в БД ───────────────────────────────
  //    record_scan() выполняет:
  //      a) INSERT в scan_events (всегда — каждое сканирование считается)
  //      b) INSERT ... ON CONFLICT DO NOTHING в unique_visitors
  //         (is_unique = true только если посетитель новый за сутки)
  const { data, error } = await supabase.rpc('record_scan', {
    p_token:     token,
    p_scan_type: 'nfc',
    p_ip:        ip,
    p_user_agent: userAgent,
    p_device:    device,
    p_lang:      lang,
  })

  if (error) {
    console.error('record_scan error (nfc):', error)
    return NextResponse.redirect(new URL('/scan-error', request.url))
  }

  if (!data || data.error) {
    // Токен не найден / филиал неактивен
    return NextResponse.redirect(new URL('/scan-error', request.url))
  }

  // ── 4. Редирект на Google Reviews ────────────────────────────────────────
  return NextResponse.redirect(data.redirect_url)
}