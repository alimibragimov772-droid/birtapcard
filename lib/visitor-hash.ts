/**
 * Сам хэш посетителя (SHA256) считается в Postgres внутри record_scan().
 * Здесь мы только готовим "сырые" данные запроса, которые передаём в RPC.
 */

export function getVisitorDevice(userAgent: string): 'android' | 'ios' | 'other' {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  return 'other'
}

export function getClientIp(request: Request): string {
  // Vercel прокидывает реальный IP клиента в x-forwarded-for
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return '0.0.0.0'
}

export function getBrowserLang(request: Request): string {
  const header = request.headers.get('accept-language') || ''
  return header.split(',')[0]?.trim() || 'unknown'
}
