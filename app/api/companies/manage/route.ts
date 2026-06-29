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
 * POST /api/companies/manage
 * Creates a new company (restaurant network). SUPER ADMIN ONLY.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, slug, logo_url, active } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('companies')
    .insert({
      name,
      slug,
      logo_url: logo_url || null,
      active: active ?? true,
      owner_id: auth.userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('companies insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}

/**
 * PUT /api/companies/manage
 * Updates company fields (name, slug, logo, active). SUPER ADMIN ONLY.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, name, slug, logo_url, active } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (slug !== undefined) update.slug = slug
  if (logo_url !== undefined) update.logo_url = logo_url || null
  if (active !== undefined) update.active = active

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('companies')
    .update(update)
    .eq('id', id)

  if (error) {
    console.error('companies update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/companies/manage
 * Deletes a company (restaurant network). SUPER ADMIN ONLY.
 * Refuses to delete while branches still reference it — branches and their
 * scan history must be removed first so nothing is silently cascade-deleted.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const { count, error: countError } = await supabase
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)

  if (countError) {
    console.error('companies delete (branch check) error:', countError)
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `У ресторана есть ${count} филиал(а) — сначала удалите все филиалы` },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('companies').delete().eq('id', id)

  if (error) {
    console.error('companies delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}