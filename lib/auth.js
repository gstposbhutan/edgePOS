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
 * Send a WhatsApp OTP to the given phone number.
 * @param {string} phone - E.164 format (e.g. +97517123456)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function sendWhatsAppOtp(phone) {
  const res = await fetch('/api/auth/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error }
  return { success: true, error: null }
}

/**
 * Verify a WhatsApp OTP and sign in.
 * Sets the Supabase session on success.
 * @param {string} phone
 * @param {string} otp - 6-digit code
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function signInWithWhatsApp(phone, otp) {
  const res = await fetch('/api/auth/whatsapp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  })
  const data = await res.json()

  console.log('[signInWithWhatsApp] Response:', data)

  if (!res.ok) return { user: null, error: data.error }
  if (!data.success) return { user: null, error: 'Verification failed' }

  // If server returned temp credentials, use signInWithPassword
  if (data.needs_signin) {
    console.log('[signInWithWhatsApp] Using signInWithPassword fallback')
    console.log('[signInWithWhatsApp] Email:', data.email, 'Password length:', data.temp_password?.length)

    // Longer delay to ensure user is fully created in Supabase
    await new Promise(resolve => setTimeout(resolve, 2000))

    const supabase = createClient()
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.temp_password,
    })

    console.log('[signInWithWhatsApp] SignIn result:', signInData, signInError)

    if (signInError) {
      console.error('[signInWithWhatsApp] SignIn error:', signInError)
      return { user: null, error: signInError.message }
    }

    if (!signInData.user) {
      console.error('[signInWithWhatsApp] No user in signInData')
      return { user: null, error: 'No user returned from sign in' }
    }

    return { user: signInData.user, error: null }
  }

  // Set the session on the Supabase client
  const supabase = createClient()
  const { error: sessionError, data: sessionData } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })

  console.log('[signInWithWhatsApp] Session set result:', sessionData, sessionError)

  if (sessionError) return { user: null, error: sessionError.message }

  // Fetch the full user with claims
  const { data: { user } } = await supabase.auth.getUser()
  console.log('[signInWithWhatsApp] Got user:', user)
  return { user, error: null }
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
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    await supabase.auth.signOut().catch(() => {})
    return null
  }
  return data.session
}

/**
 * Get the current user with JWT claims (entity_id, role, sub_role, permissions).
 * @returns {Promise<object|null>}
 */
export async function getUser() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    // Stale/expired refresh token — clear the bad session
    await supabase.auth.signOut().catch(() => {})
    return null
  }
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
  CUSTOMER:     '/shop',
}
