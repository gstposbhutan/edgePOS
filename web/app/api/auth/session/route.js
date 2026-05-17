import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ user: null }, { status: 500 })
  }

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: 'sb-edgepos-auth-token' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  // Enrich with profile data
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('entity_id, sub_role, role')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone ?? null,
      entityId: profile?.entity_id ?? user.user_metadata?.entity_id ?? null,
      role: profile?.role ?? user.user_metadata?.role ?? null,
      subRole: profile?.sub_role ?? user.user_metadata?.sub_role ?? null,
    },
  })
}
