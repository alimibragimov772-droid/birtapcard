import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/branches/manage
 * Создаёт новый филиал (обходит RLS через Service Role).
 * Body: { company_id, name, slug, google_url, nfc_token, qr_token, active }
 */
export async function POST(request: NextRequest) {
  // Проверяем что пользователь авторизован
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { company_id, name, slug, google_url, nfc_token, qr_token, active } = body

  if (!company_id || !name || !slug || !google_url || !nfc_token || !qr_token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('branches')
    .insert({
      company_id,
      name,
      slug,
      google_url,
      nfc_token,
      qr_token,
      qr_image_url: null,
      active: active ?? true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('branches insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}

/**
 * PUT /api/branches/manage
 * Обновляет основные поля филиала.
 * Body: { id, company_id, name, slug, google_url, active }
 */
export async function PUT(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, company_id, name, slug, google_url, active } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('branches')
    .update({ company_id, name, slug, google_url, active })
    .eq('id', id)

  if (error) {
    console.error('branches update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/branches/manage
 * Удаляет филиал и его QR из Storage.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase.from('branches').delete().eq('id', id)
  if (error) {
    console.error('branches delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Чистим QR-файл из Storage (не критично если не получится)
  await supabase.storage.from('qr-codes').remove([`${id}.png`]).catch(() => {})

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, qr_image_url } = body

  if (!id || !qr_image_url) {
    return NextResponse.json({ error: 'Missing id or qr_image_url' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('branches')
    .update({ qr_image_url })
    .eq('id', id)

  if (error) {
    console.error('branches update qr error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}