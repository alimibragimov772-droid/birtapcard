'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const icons = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  analytics: 'M18 20V10 M12 20V4 M6 20v-6',
  restaurants: 'M3 2h18v4H3z M3 6v14a1 1 0 001 1h16a1 1 0 001-1V6 M8 6v4 M12 6v4 M16 6v4',
  branches: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  qrcodes: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 17h.01 M17 14h.01 M20 14h.01 M17 17h.01 M20 17h.01 M17 20h.01 M20 20h.01',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  telegram: 'M21.5 2L2 9.5l7 3 3 7 2.5-5 7 7.5',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
}

type NavItem = {
  href: string
  label: string
  icon: keyof typeof icons
}

// ─── Role-based navigation ─────────────────────────────────────────────────
// super_admin sees everything.
// owner sees Dashboard + Analytics ONLY (read-only).
// branch_manager sees Dashboard + Analytics ONLY (read-only, scoped to own branch).
// Neither owner nor branch_manager sees Settings, Companies, Branches, Users, etc.

const SUPER_ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Главная',
    items: [
      { href: '/dashboard', label: 'Дашборд', icon: 'dashboard' },
      { href: '/analytics', label: 'Аналитика', icon: 'analytics' },
    ],
  },
  {
    group: 'Управление',
    items: [
      { href: '/companies', label: 'Рестораны', icon: 'restaurants' },
      { href: '/branches', label: 'Филиалы', icon: 'branches' },
      { href: '/qrcodes', label: 'QR-коды', icon: 'qrcodes' },
      { href: '/users', label: 'Пользователи', icon: 'users' },
    ],
  },
  {
    group: 'Инструменты',
    items: [
      { href: '/telegram', label: 'Telegram', icon: 'telegram' },
      { href: '/settings', label: 'Настройки', icon: 'settings' },
    ],
  },
]

// Owner: read-only analytics only. No admin sections, no settings.
const OWNER_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Аналитика',
    items: [
      { href: '/dashboard', label: 'Дашборд', icon: 'dashboard' },
      { href: '/analytics', label: 'Аналитика', icon: 'analytics' },
    ],
  },
]

// Branch Manager: read-only, only own branch analytics.
const BRANCH_MANAGER_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Аналитика',
    items: [
      { href: '/dashboard', label: 'Дашборд', icon: 'dashboard' },
      { href: '/analytics', label: 'Аналитика', icon: 'analytics' },
    ],
  },
]

function getNavByRole(role: string | null) {
  if (role === 'super_admin') return SUPER_ADMIN_NAV
  if (role === 'owner') return OWNER_NAV
  return BRANCH_MANAGER_NAV
}

type Profile = {
  full_name: string | null
  role: string | null
}

function NavGroup({ label, items, pathname }: {
  label: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '1.2px',
        padding: '0 8px', margin: '16px 0 6px',
      }}>
        {label}
      </div>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 8,
              fontSize: 13.5, fontWeight: 500,
              color: active ? 'var(--mint)' : 'var(--text-dim)',
              background: active ? 'var(--mint-dim)' : 'transparent',
              transition: 'all 0.18s',
              marginBottom: 2,
              textDecoration: 'none',
            }}
            onMouseEnter={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'var(--card)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--text-dim)'
              }
            }}
          >
            <span style={{ color: active ? 'var(--mint)' : 'inherit', flexShrink: 0 }}>
              <Icon d={icons[item.icon]} />
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

const pageTitles: Record<string, { title: string; sub: string }> = {
  '/dashboard':  { title: 'Дашборд',         sub: 'Общая статистика по сканированиям' },
  '/analytics':  { title: 'Аналитика',       sub: 'Детальная аналитика сканирований' },
  '/companies':  { title: 'Рестораны',       sub: 'Управление сетью ресторанов' },
  '/branches':   { title: 'Филиалы',         sub: 'Управление точками и NFC/QR-токенами' },
  '/qrcodes':    { title: 'QR-коды',         sub: 'Просмотр и скачивание QR-кодов' },
  '/users':      { title: 'Пользователи',    sub: 'Доступ и роли сотрудников' },
  '/telegram':   { title: 'Telegram',        sub: 'Уведомления в Telegram' },
  '/settings':   { title: 'Настройки',       sub: 'Профиль и безопасность' },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [time, setTime] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase
        .from('profiles')
        .select('full_name, role')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [router])

  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const pageInfo = pageTitles[pathname] ?? { title: 'BirTapCard', sub: '' }
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const roleLabel =
    profile?.role === 'super_admin' ? 'Super Admin' :
    profile?.role === 'owner'       ? 'Владелец' :
    profile?.role === 'branch_manager' ? 'Менеджер' : ''

  const navGroups = getNavByRole(profile?.role ?? null)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside style={{
        width: 240, minHeight: '100vh',
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'fixed', left: 0, top: 0, bottom: 0,
        zIndex: 100, overflowY: 'auto',
      }}>

        {/* Логотип */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--mint), #00A882)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 10,
                background: 'var(--mint)', opacity: 0,
                animation: 'btc-pulse 2.5s ease-out infinite',
              }} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#070C1A" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 8a6 6 0 0012 0" />
                <path d="M3 8a9 9 0 0018 0" />
                <path d="M12 8v8" />
                <circle cx="12" cy="16" r="1" fill="#070C1A" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                BirTapCard
              </div>
              <div style={{
                fontSize: 10, color: 'var(--mint)', fontWeight: 500,
                letterSpacing: 1, textTransform: 'uppercase',
              }}>
                Аналитика
              </div>
            </div>
          </div>
        </div>

        {/* Навигация — строго зависит от роли */}
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {navGroups.map(group => (
            <NavGroup
              key={group.group}
              label={group.group}
              items={group.items}
              pathname={pathname}
            />
          ))}
        </nav>

        {/* Пользователь + выход */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 10, borderRadius: 8, background: 'var(--card)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--mint), var(--blue))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--bg)',
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.full_name ?? '…'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--mint)' }}>{roleLabel}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Выйти"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4, borderRadius: 4,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Icon d={icons.logout} size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────── */}
      <div style={{ marginLeft: 240, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Топбар */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(7,12,26,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              {pageInfo.title}
            </div>
            {pageInfo.sub && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                {pageInfo.sub}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: 12, color: 'var(--text-muted)',
              padding: '6px 12px', borderRadius: 6,
              background: 'var(--card)', border: '1px solid var(--border)',
            }}>
              {time}
            </div>
            <button style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
              color: 'var(--text-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon d={icons.bell} size={15} />
            </button>
          </div>
        </header>

        {/* Контент страницы */}
        <main style={{ padding: '24px 28px', flex: 1 }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes btc-pulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
