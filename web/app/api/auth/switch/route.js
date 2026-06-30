import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/auth/switch — atomic cashier handover.
 *
 * Swaps the logged-in cashier for another member of the SAME store without
 * touching the open shift (drawer/float continuity; opened_by is unchanged).
 *
 * Atomicity is the whole point: the new auth cookies are written to the response
 * ONLY on full success. On any failure (wrong password, or a cashier from another
 * store) we return an error WITHOUT setting auth cookies, so the browser keeps the
 * current session and the current cashier stays logged in.
 */
export async function POST(request) {
  // The current session decides which store we're allowed to swap within.
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentEntityId = ctx.entityId

  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const cookieStore = await cookies()

  // Collect the cookies the SSR client wants to set during sign-in. We hold them
  // here and only attach them to the final response on full success.
  const setCookies = []
  const supabase = createServerClient(url, key, {
    cookieOptions: { name: 'sb-edgepos-auth-token' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookies.push({ name, value, options })
        })
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Wrong password → current cashier must stay logged in. No auth cookies written.
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  // Load the new user's profile to confirm they belong to the current store.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('entity_id, sub_role, role')
    .eq('id', data.user.id)
    .single()

  const newEntityId = profile?.entity_id ?? data.user.user_metadata?.entity_id ?? null

  if (newEntityId !== currentEntityId) {
    // Different store → reject and leave the current session untouched.
    return NextResponse.json({ error: 'Cashier belongs to a different store' }, { status: 403 })
  }

  // Full success — now (and only now) swap the session by writing the new cookies.
  const finalResponse = NextResponse.json({
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone ?? null,
      entityId: newEntityId,
      role: profile?.role ?? data.user.user_metadata?.role ?? null,
      subRole: profile?.sub_role ?? data.user.user_metadata?.sub_role ?? null,
    },
  })
  for (const { name, value, options } of setCookies) {
    finalResponse.cookies.set(name, value, options)
  }
  return finalResponse
}
