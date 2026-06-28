import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

const VALID_ROLES = ['super_admin', 'owner', 'branch_manager'] as const

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
 * PUT /api/users/manage
 * Updates a user's profile (full_name, role, company_id). SUPER ADMIN ONLY.
 * This is the ONLY path allowed to change a user's role — it never trusts
 * the client to self-elevate, and the live DB grants no direct UPDATE
 * permission on profiles.role to owner/branch_manager via RLS.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { profile_id, full_name, role, company_id } = body

  if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (full_name !== undefined) update.full_name = full_name || null
  if (role !== undefined) {
    update.role = role
    // company_id only applies to owner / branch_manager
    update.company_id = role === 'super_admin' ? null : (company_id || null)
  } else if (company_id !== undefined) {
    update.company_id = company_id || null
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', profile_id)

  if (error) {
    console.error('profiles update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
