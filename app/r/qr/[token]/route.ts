import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getVisitorDevice, getClientIp, getBrowserLang } from '@/lib/visitor-hash'

export const dynamic = 'force-dynamic'

/**
 * GET /r/qr/[token]
 * Клиент сканирует QR-код на столе → попадает сюда →
 * сервер фиксирует событие через record_scan() → редирект на Google Reviews.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServiceRoleClient()

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') || ''
  const device = getVisitorDevice(userAgent)
  const lang = getBrowserLang(request)

  const { data, error } = await supabase.rpc('record_scan', {
    p_token: token,
    p_scan_type: 'qr',
    p_ip: ip,
    p_user_agent: userAgent,
    p_device: device,
    p_lang: lang,
  })

  if (error) {
    console.error('record_scan error (qr):', error)
    return NextResponse.redirect(new URL('/scan-error', request.url))
  }

  if (!data || data.error) {
    return NextResponse.redirect(new URL('/scan-error', request.url))
  }

  return NextResponse.redirect(data.redirect_url)
}
