import { createClient } from '@/lib/supabase/client'

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function signIn(email, password) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { user: null, error: error.message }
  return { user: data.user, error: null }
}

/**
 * Sign out the current user.
 * @returns {Promise<void>}
 */
export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
}

/**
 * Get the current session (client-side).
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Get the current user with JWT claims (entity_id, role, sub_role, permissions).
 * @returns {Promise<object|null>}
 */
export async function getUser() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/**
 * Extract role claims from a Supabase user object.
 * @param {object} user
 * @returns {{ entityId: string, role: string, subRole: string, permissions: string[] }}
 */
export function getRoleClaims(user) {
  // Claims injected by custom_access_token_hook live in user_metadata after decode
  const meta = user?.user_metadata ?? {}
  const app  = user?.app_metadata ?? {}
  return {
    entityId:    meta.entity_id    ?? app.entity_id    ?? null,
    role:        meta.role         ?? app.role         ?? null,
    subRole:     meta.sub_role     ?? app.sub_role     ?? null,
    permissions: meta.permissions  ?? app.permissions  ?? [],
  }
}

/**
 * Check if a user has a specific permission flag.
 * @param {object} user
 * @param {string} permission  e.g. 'pos:void', 'reports:export'
 * @returns {boolean}
 */
export function hasPermission(user, permission) {
  const { permissions } = getRoleClaims(user)
  return permissions.includes(permission)
}

/**
 * Role home routes — where each role lands after login.
 */
export const ROLE_HOME = {
  SUPER_ADMIN:  '/admin',
  DISTRIBUTOR:  '/admin',
  WHOLESALER:   '/admin',
  RETAILER:     '/pos',
}
