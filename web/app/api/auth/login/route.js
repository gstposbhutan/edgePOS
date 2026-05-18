import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Collect cookies set by Supabase SSR
  const setCookies = []
  let response = NextResponse.json({ success: true })

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: 'sb-edgepos-auth-token' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookies.push({ name, value, options })
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('entity_id, sub_role, role')
    .eq('id', data.user.id)
    .single()

  const body = {
    success: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone ?? null,
      entityId: profile?.entity_id ?? data.user.user_metadata?.entity_id ?? null,
      role: profile?.role ?? data.user.user_metadata?.role ?? null,
      subRole: profile?.sub_role ?? data.user.user_metadata?.sub_role ?? null,
    },
  }

  // Build final response with body + collected auth cookies
  const finalResponse = NextResponse.json(body)
  for (const { name, value, options } of setCookies) {
    finalResponse.cookies.set(name, value, options)
  }
  return finalResponse
}
