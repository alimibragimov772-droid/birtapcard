/**
 * visitor-hash.ts
 *
 * Готовит "сырые" данные запроса для передачи в record_scan() RPC.
 * Сам SHA-256 хэш посетителя вычисляется внутри Postgres.
 *
 * НОВОЕ: фильтрация ботов/превью-краулеров (Telegram, WhatsApp, Slack и др.)
 * — они не являются реальными сканированиями и не должны попадать в аналитику.
 */

// ─── Известные боты и превью-краулеры ────────────────────────────────────────

const BOT_UA_PATTERNS: RegExp[] = [
  // Telegram: открывает ссылки для генерации превью в чате
  /TelegramBot/i,
  /Telegram/i,
  // WhatsApp Preview
  /WhatsApp/i,
  // Slack Link Preview
  /Slackbot/i,
  /slack-imgproxy/i,
  // Facebook / Instagram Preview
  /facebookexternalhit/i,
  /Facebot/i,
  // Twitter / X Card fetcher
  /Twitterbot/i,
  // LinkedIn Preview
  /LinkedInBot/i,
  // iMessage Link Preview
  /iMessage/i,
  // Viber Preview
  /Viber/i,
  // Generic crawlers / bots
  /Googlebot/i,
  /bingbot/i,
  /YandexBot/i,
  /DuckDuckBot/i,
  /Baiduspider/i,
  /AhrefsBot/i,
  /SemrushBot/i,
  /DataForSeoBot/i,
  /python-requests/i,
  /curl\//i,
  /wget\//i,
  /HeadlessChrome/i,
  /PhantomJS/i,
  // Catchall: любой UA, явно объявляющий себя ботом
  /bot[^a-z]/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
]

/**
 * Возвращает true, если User-Agent принадлежит боту, превью-краулеру
 * или любому неинтерактивному HTTP-клиенту.
 */
export function isBot(userAgent: string): boolean {
  if (!userAgent || userAgent.trim() === '') return true  // пустой UA — бот
  return BOT_UA_PATTERNS.some(pattern => pattern.test(userAgent))
}

// ─── Тип устройства ──────────────────────────────────────────────────────────

export function getVisitorDevice(userAgent: string): 'android' | 'ios' | 'other' {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  return 'other'
}

// ─── IP клиента ──────────────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  // Vercel прокидывает реальный IP клиента в x-forwarded-for
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return '0.0.0.0'
}

// ─── Язык браузера ───────────────────────────────────────────────────────────

export function getBrowserLang(request: Request): string {
  const header = request.headers.get('accept-language') || ''
  return header.split(',')[0]?.trim() || 'unknown'
}