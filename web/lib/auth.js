/**
 * Auth helpers — all go through Next.js BFF API routes.
 * The browser never talks to Supabase/Kong directly.
 */

/**
 * Sign in with email and password via BFF.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function signIn(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) return { user: null, error: data.error }
    return { user: data.user, error: null }
  } catch (err) {
    return { user: null, error: err.message }
  }
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

  if (!res.ok) return { user: null, error: data.error }
  if (!data.success) return { user: null, error: 'Verification failed' }

  // If server returned temp credentials, use signInWithPassword
  if (data.needs_signin) {
    const loginRes = await signIn(data.email, data.temp_password)
    return loginRes
  }

  // Session was set server-side — fetch it via the session endpoint
  return getUser()
}

/**
 * Sign out the current user via BFF.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' })
}

/** Customer email OTP: send a 6-digit code to the email. Returns { success, otp? (mock), error }. */
export async function sendEmailOtp(email) {
  const res = await fetch('/api/auth/email-otp/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  })
  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error }
  return { success: true, otp: data.otp ?? null, error: null }
}

/** Customer sign-up completion: verify the email OTP + set password & phone, then sign in. */
export async function completeSignup(email, otp, password, phone) {
  const res = await fetch('/api/auth/email-otp/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, password, phone }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) return { user: null, error: data.error || 'Sign-up failed' }
  const user = await getUser()
  return { user, error: null }
}

/** Set the signed-in customer's (mandatory) phone number. */
export async function setCustomerPhone(phone) {
  const res = await fetch('/api/auth/customer-phone', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
  })
  const data = await res.json()
  return res.ok ? { success: true, error: null } : { success: false, error: data.error }
}

/**
 * Get the current session (client-side) via BFF.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  try {
    const res = await fetch('/api/auth/session')
    if (!res.ok) return null
    const { user } = await res.json()
    return user
  } catch {
    return null
  }
}

/**
 * Get the current user with enriched claims via BFF.
 * @returns {Promise<object|null>}
 */
export async function getUser() {
  try {
    const res = await fetch('/api/auth/session')
    if (!res.ok) return null
    const { user } = await res.json()
    return user ?? null
  } catch {
    return null
  }
}

/**
 * Extract role claims from a user object returned by BFF.
 * @param {object} user
 * @returns {{ entityId: string, role: string, subRole: string, permissions: string[] }}
 */
export function getRoleClaims(user) {
  return {
    entityId:    user?.entityId    ?? null,
    role:        user?.role        ?? null,
    subRole:     user?.subRole     ?? null,
    permissions: user?.permissions ?? [],
  }
}

/**
 * Get enriched claims — BFF session already includes entity_id/sub_role from user_profiles.
 */
export async function getEnrichedClaims(user) {
  // BFF already enriches with profile data; no extra fetch needed
  return getRoleClaims(user)
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
  DISTRIBUTOR:  '/distributor',
  WHOLESALER:   '/wholesaler',
  RETAILER:     '/pos',
  RIDER:        '/rider',
  CUSTOMER:     '/shop',
}
