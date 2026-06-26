import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Supabase-клиент для Server Components, Server Actions и Route Handlers.
 * Работает в контексте текущего пользователя (соблюдает RLS).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Вызов из Server Component, где запись cookies запрещена.
            // Сессия в любом случае будет обновлена в middleware.ts
          }
        },
      },
    }
  )
}

/**
 * Service Role клиент — ПОЛНОСТЬЮ обходит RLS.
 * Использовать ТОЛЬКО внутри route.ts / cron-задач на сервере.
 * НИКОГДА не импортировать в Client Component и не светить ключ в браузере.
 */
export function createServiceRoleClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
