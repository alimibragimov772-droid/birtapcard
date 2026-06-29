import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Role-based path access matrix:
 *
 * super_admin  → /dashboard, /analytics, /companies, /branches, /users,
 *                /telegram, /qrcodes, /settings
 * owner        → /dashboard, /analytics  (read-only)
 * branch_manager → /dashboard, /analytics  (read-only, scoped to own branch via RLS)
 *
 * Any role accessing a path outside their allowed set → redirect /dashboard
 */

const SUPER_ADMIN_ONLY_PATHS = [
  '/companies',
  '/branches',
  '/users',
  '/telegram',
  '/qrcodes',
  '/settings',
]

// Paths allowed only for super_admin and owner
const OWNER_ALLOWED_PATHS = [
  '/dashboard',
  '/analytics',
]

// ALL dashboard paths (union of all role paths)
const ALL_DASHBOARD_PATHS = [
  '/dashboard',
  '/analytics',
  '/companies',
  '/branches',
  '/users',
  '/telegram',
  '/qrcodes',
  '/settings',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')
  const isPublicScanRoute = pathname.startsWith('/r/')
  const isScanErrorRoute = pathname.startsWith('/scan-error')

  // Not authenticated → /login
  if (!user && !isAuthRoute && !isPublicScanRoute && !isScanErrorRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated on /login → /dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Role-based path enforcement for authenticated users
  if (user) {
    const isDashboardPath = ALL_DASHBOARD_PATHS.some(p => pathname.startsWith(p))

    if (isDashboardPath) {
      // Fetch user role from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      const role = profile?.role ?? 'branch_manager'

      const isAdminOnlyPath = SUPER_ADMIN_ONLY_PATHS.some(p => pathname.startsWith(p))

      // super_admin: no restrictions
      if (role === 'super_admin') {
        return supabaseResponse
      }

      // owner: only /dashboard and /analytics
      if (role === 'owner') {
        const isAllowed = OWNER_ALLOWED_PATHS.some(p => pathname.startsWith(p))
        if (!isAllowed) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
        return supabaseResponse
      }

      // branch_manager: only /dashboard and /analytics
      if (role === 'branch_manager') {
        const isAllowed = OWNER_ALLOWED_PATHS.some(p => pathname.startsWith(p))
        if (!isAllowed) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
        return supabaseResponse
      }

      // Unknown role → redirect to dashboard for safety
      if (isAdminOnlyPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
