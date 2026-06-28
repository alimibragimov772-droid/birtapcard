import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

const QR_BUCKET = 'qr-codes'

/**
 * POST /api/branches/qr-upload
 * Uploads a PNG QR code to Supabase Storage. SUPER ADMIN ONLY.
 * Body: { branchId: string, imageBase64: string }
 */
export async function POST(request: NextRequest) {
  const userClient = await createClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { branchId, imageBase64 } = body

  if (!branchId || !imageBase64) {
    return NextResponse.json({ error: 'Missing branchId or imageBase64' }, { status: 400 })
  }

  const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const supabase = createServiceRoleClient()
  const filePath = `${branchId}.png`

  const { error: upErr } = await supabase.storage
    .from(QR_BUCKET)
    .upload(filePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (upErr) {
    console.error('QR upload error:', upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(filePath)
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`

  return NextResponse.json({ publicUrl })
}