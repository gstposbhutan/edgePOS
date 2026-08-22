import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Request a password-reset email (GoTrue recovery). Always returns success to avoid account
// enumeration. The recovery link redirects to /login/reset/confirm where the new password is set.
export async function POST(request) {
  const { email } = await request.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ success: true })   // fail closed, no enumeration

  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookieOptions: { name: 'sb-pelbu-auth', path: '/', sameSite: 'lax', domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined },
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })

  // NOTE: the target must be in GoTrue's redirect allow-list (GOTRUE_URI_ALLOW_LIST) or the
  // email link falls back to GoTrue's SITE_URL.
  const site = process.env.NEXT_PUBLIC_APP_URL || 'https://pos.pelbu.com'
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/login/reset/confirm` }).catch(() => {})
  return NextResponse.json({ success: true })
}
