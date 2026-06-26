import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем роль
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!profile || !['super_admin', 'owner'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { chat_id, company_name } = await req.json()
    if (!chat_id) {
      return NextResponse.json({ error: 'chat_id обязателен' }, { status: 400 })
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN не задан на сервере' }, { status: 500 })
    }

    const text =
      `✅ *BirTapCard* — тест подключения\n\n` +
      `Бот успешно подключён к ${company_name ? `компании *${company_name}*` : 'вашему чату'}.\n` +
      `Ежедневные отчёты будут приходить в 08:00 по Ташкенту. 🕗`

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: 'Markdown',
      }),
    })

    const tgJson = await tgRes.json()

    if (!tgJson.ok) {
      return NextResponse.json(
        { error: tgJson.description ?? 'Telegram API вернул ошибку' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telegram/test]', err)
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 })
  }
}