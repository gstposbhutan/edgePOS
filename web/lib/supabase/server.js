// Server-side Supabase clients for the POS.
//
// RLS runs as the logged-in user via the `sb-pelbu-auth` cookie (from ./pelbu-db, scoped to
// `.pelbu.com` in prod so one session is valid across every *.pelbu.com surface). The service client
// bypasses RLS for privileged reads (user_profiles, riders). Server-only — never import from a client
// component. This is the single auth primitive the api/auth/* routes resolve via `@/lib/supabase/server`.
import { cookies } from 'next/headers'
import { createServer } from './pelbu-db'
import { createClient as createSbClient } from '@supabase/supabase-js'

const serverUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL

// Shared cookie options — mirrors ./pelbu-db so every surface reads one SSO session.
export const SB_COOKIE_OPTIONS = {
  name: 'sb-pelbu-auth',
  path: '/',
  sameSite: 'lax',
  domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
}

/** User-scoped server client (RSC / route handler), bound to the request cookies. Null if env missing. */
export async function createClient() {
  const url = serverUrl()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const store = await cookies()
  // pelbu-db's createServer bakes in the shared cookie name + domain; we only supply the adapter.
  return createServer({
    getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options)
      } catch {
        // RSC context: cookies are read-only here; the proxy refreshes the session cookie.
      }
    },
  }, { schema: 'pos' })   // POS tables live in the `pos` schema; shared tables resolve via pos.* bridge views.
}

/** Service-role client — server-only, bypasses RLS. Never expose to the browser. */
export function createServiceClient() {
  const url = serverUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSbClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'pos' } })
}

// Lazy singleton for API routes — avoids a module-level crash during build.
let _serviceClient
export function getServiceClient() {
  if (_serviceClient === undefined) _serviceClient = createServiceClient()
  return _serviceClient ?? null
}

// Shared auth context for API routes — reads entity_id/sub_role/role from user_profiles.
export async function getAuthContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createServiceClient()
  if (!serviceClient) return null

  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('entity_id, sub_role, role')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.entity_id) return null

  return {
    entityId: profile.entity_id,
    subRole: profile.sub_role,
    role: profile.role,
    userId: user.id,
    supabase: serviceClient,
    userClient: supabase,
  }
}

// Auth context for the RIDER portal. Riders are NOT entities (no user_profiles/entity_id row), so they
// authenticate purely by session → riders row (matched on auth_user_id). Null for a missing session,
// a non-rider user, or a deactivated rider.
export async function getRiderContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createServiceClient()
  if (!serviceClient) return null

  const { data: rider } = await serviceClient
    .from('riders')
    .select('id, name, whatsapp_no, is_active, is_available, auth_email, email_notifications_enabled')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!rider || !rider.is_active) return null

  return { userId: user.id, rider, supabase: serviceClient, userClient: supabase }
}
