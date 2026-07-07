import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/auth/oauth/callback?code=...&redirect=... — GoTrue redirects here after a social login.
// Exchange the code for a session, ensure a CUSTOMER entity/profile exists, then redirect. New
// social customers still lack a phone → sent to /login?needphone so the phone step runs.
export async function GET(request) {
  const reqUrl = new URL(request.url)
  const code = reqUrl.searchParams.get('code')
  const redirect = reqUrl.searchParams.get('redirect') || '/shop'
  const origin = process.env.NEXT_PUBLIC_APP_URL || reqUrl.origin
  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`)

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const cookieStore = await cookies()
  const response = NextResponse.redirect(`${origin}${redirect}`)

  const ssr = createServerClient(url, key, {
    cookieOptions: { name: 'sb-edgepos-auth-token' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  })
  const { data, error } = await ssr.auth.exchangeCodeForSession(code)
  if (error || !data?.user) return NextResponse.redirect(`${origin}/login?error=oauth`)

  // Provision the CUSTOMER (entity + profile) on first social login, mirroring the email-OTP path.
  const svc = createServiceClient()
  const uid = data.user.id
  const { data: prof } = await svc.from('user_profiles').select('id, entity_id').eq('id', uid).maybeSingle()
  let needsPhone = true
  if (!prof) {
    const name = (data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Customer')
    await svc.from('entities').upsert({ id: uid, name, role: 'CUSTOMER', is_active: true })
    await svc.from('user_profiles').insert({ id: uid, entity_id: uid, role: 'CUSTOMER', sub_role: 'CUSTOMER', full_name: name })
    await svc.auth.admin.updateUserById(uid, { app_metadata: { role: 'CUSTOMER', sub_role: 'CUSTOMER', entity_id: uid } })
  } else {
    const { data: ent } = await svc.from('entities').select('whatsapp_no').eq('id', prof.entity_id).maybeSingle()
    needsPhone = !ent?.whatsapp_no
  }

  // Route new/phoneless customers through the phone-capture step.
  if (needsPhone) response.headers.set('Location', `${origin}/login?needphone=1&redirect=${encodeURIComponent(redirect)}`)
  return response
}
