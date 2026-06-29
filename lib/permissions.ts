/**
 * Centralized RBAC permission definitions.
 * Single source of truth for all role-based access control.
 */

export type UserRole = 'super_admin' | 'owner' | 'branch_manager'

/**
 * Pages that ONLY super_admin can access.
 * Middleware redirects everyone else to /dashboard.
 */
export const SUPER_ADMIN_ONLY_PATHS = [
  '/companies',
  '/branches',
  '/users',
  '/telegram',
  '/qrcodes',
  '/settings',
]

/**
 * Pages available to owner (read-only analytics).
 * Branch manager is NOT included — they are redirected to /dashboard.
 */
export const OWNER_ALLOWED_PATHS = [
  '/dashboard',
  '/analytics',
]

/** Pages available to ALL authenticated roles */
export const PUBLIC_DASHBOARD_PATHS = [
  '/dashboard',
  '/analytics',
]

export const PERMISSIONS = {
  super_admin: {
    canCreateCompany:     true,
    canEditCompany:       true,
    canCreateBranch:      true,
    canEditBranch:        true,
    canDeleteBranch:      true,
    canManageUsers:       true,
    canViewAllData:       true,
    canAccessAdminPages:  true,
    canAccessSettings:    true,
  },
  owner: {
    canCreateCompany:     false,
    canEditCompany:       false,
    canCreateBranch:      false,
    canEditBranch:        false,
    canDeleteBranch:      false,
    canManageUsers:       false,
    canViewAllData:       true,
    canAccessAdminPages:  false,
    canAccessSettings:    false,
  },
  branch_manager: {
    canCreateCompany:     false,
    canEditCompany:       false,
    canCreateBranch:      false,
    canEditBranch:        false,
    canDeleteBranch:      false,
    canManageUsers:       false,
    canViewAllData:       false,
    canAccessAdminPages:  false,
    canAccessSettings:    false,
  },
} as const

export function hasPermission(
  role: UserRole | string | null | undefined,
  permission: keyof typeof PERMISSIONS.super_admin
): boolean {
  if (!role) return false
  const perms = PERMISSIONS[role as UserRole]
  if (!perms) return false
  return perms[permission]
}

/** Returns true only for super_admin */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin'
}

/** Returns true for super_admin and owner */
export function canViewAnalytics(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'owner' || role === 'branch_manager'
}