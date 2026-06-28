import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

/** Fetches the role of the currently authenticated user. Returns null if unauthenticated. */
async function getAuthenticatedRole(): Promise<{ userId: string; role: string } | null> {
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return null

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!profile) return null
  return { userId: user.id, role: profile.role }
}

/**
 * POST /api/telegram/settings
 * Creates Telegram notification settings for a company. SUPER ADMIN ONLY.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { company_id, chat_id, notify_daily, active } = body

  if (!company_id) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('telegram_settings')
    .insert({ company_id, chat_id, notify_daily: notify_daily ?? true, active: active ?? true })

  if (error) {
    console.error('telegram_settings insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * PUT /api/telegram/settings
 * Updates Telegram notification settings. SUPER ADMIN ONLY.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, chat_id, notify_daily, active } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('telegram_settings')
    .update({ chat_id, notify_daily, active })
    .eq('id', id)

  if (error) {
    console.error('telegram_settings update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
