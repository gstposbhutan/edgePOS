import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  let response = NextResponse.json({ success: true })

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: 'sb-edgepos-auth-token' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // Fetch enriched profile for the response
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('entity_id, sub_role, role')
    .eq('id', data.user.id)
    .single()

  return NextResponse.json({
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone ?? null,
      entityId: profile?.entity_id ?? data.user.user_metadata?.entity_id ?? null,
      role: profile?.role ?? data.user.user_metadata?.role ?? null,
      subRole: profile?.sub_role ?? data.user.user_metadata?.sub_role ?? null,
    },
  })
}
