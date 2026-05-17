import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

const serverUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL

const cookieOpts = {
  cookieOptions: {
    name: 'sb-edgepos-auth-token' as const,
  },
}

export async function createClient() {
  const cookieStore = await cookies()

  const url = serverUrl()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  return createServerClient<Database>(url, key, {
    ...cookieOpts,
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
          // Server component — cookies can only be set in middleware or route handlers
        }
      },
    },
  })
}

// Service role client — server-side only, never expose to browser
export function createServiceClient() {
  const url = serverUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServerClient<Database>(url, key, {
    ...cookieOpts,
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

// Lazy singleton for API routes — avoids module-level crash during build
let _serviceClient: ReturnType<typeof createServerClient<Database>> | null | undefined
export function getServiceClient() {
  if (_serviceClient === undefined) {
    const url = serverUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      _serviceClient = null
    } else {
      _serviceClient = createServerClient<Database>(url, key, {
        ...cookieOpts,
        cookies: { getAll: () => [], setAll: () => {} },
      })
    }
  }
  return _serviceClient
}

// Shared auth context for API routes — reads entity_id/sub_role from user_profiles
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

  if (!profile) return null
  const p = profile as unknown as { entity_id: string | null; sub_role: string | null; role: string | null }
  if (!p.entity_id) return null

  return {
    entityId: p.entity_id,
    subRole: p.sub_role,
    role: p.role,
    userId: user.id,
    supabase: serviceClient,
  }
}
