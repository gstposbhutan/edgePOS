import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/auth/email-otp/verify — verify the customer's email code, provision the CUSTOMER on first
// login, and set the session. Returns needs_phone=true when the profile still lacks a phone (the app
// then requires it — phone is mandatory for customers).
const MAX_ATTEMPTS = 5

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) return null
    const u = data.users.find(x => (x.email || '').toLowerCase() === email)
    if (u) return u
    if (data.users.length < 200) return null
  }
  return null
}

export async function POST(request) {
  try {
    const { email, otp } = await request.json()
    const em = (email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || !/^\d{6}$/.test(otp || '')) {
      return NextResponse.json({ error: 'Email and 6-digit code required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const mock = process.env.MOCK_WHATSAPP === 'true'

    // Verify the code (unless mock universal code).
    if (!(mock && otp === '123456')) {
      const { data: rec } = await supabase
        .from('email_otps')
        .select('*')
        .eq('email', em)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!rec) return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 })
      if (rec.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
      const ok = await bcrypt.compare(otp, rec.otp_hash)
      if (!ok) {
        await supabase.from('email_otps').update({ attempts: rec.attempts + 1 }).eq('id', rec.id)
        return NextResponse.json({ error: 'Incorrect code' }, { status: 400 })
      }
      await supabase.from('email_otps').update({ used: true }).eq('id', rec.id)
    }

    // Find or create the CUSTOMER (auth user + entity + profile). entity.id = auth user id.
    let user = await findUserByEmail(supabase, em)
    if (!user) {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: em, email_confirm: true,
        password: 'Cx' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      })
      if (authErr || !authData?.user) return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
      user = authData.user
      const name = em.split('@')[0]
      const { error: entErr } = await supabase.from('entities').insert({ id: user.id, name, role: 'CUSTOMER', is_active: true })
      if (entErr) { await supabase.auth.admin.deleteUser(user.id); return NextResponse.json({ error: 'Could not create account' }, { status: 500 }) }
      await supabase.from('user_profiles').insert({ id: user.id, entity_id: user.id, role: 'CUSTOMER', sub_role: 'CUSTOMER', full_name: name })
      // Claims for RLS (the JWT carries app_metadata; the entity_id claim is what auth_entity_id reads).
      await supabase.auth.admin.updateUserById(user.id, { app_metadata: { role: 'CUSTOMER', sub_role: 'CUSTOMER', entity_id: user.id } })
    }

    // Does the customer have a phone yet? (mandatory — the client will collect it if not.)
    const { data: entity } = await supabase.from('entities').select('whatsapp_no').eq('id', user.id).maybeSingle()
    const needsPhone = !entity?.whatsapp_no

    // Issue a session: mint a magic-link token server-side, then redeem its token_hash on an SSR
    // client so the auth cookies get written to the response (generateLink itself returns no tokens).
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: em })
    if (linkErr || !linkData?.properties?.hashed_token) return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })

    const cookieStore = await cookies()
    const response = NextResponse.json({ success: true, needs_phone: needsPhone })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })

    const ssr = createServerClient(url, key, {
      cookieOptions: { name: 'sb-edgepos-auth-token' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    })
    const { error: vErr } = await ssr.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
    if (vErr) { console.error('[email-otp/verify] session verifyOtp failed:', vErr.message); return NextResponse.json({ error: 'Failed to create session' }, { status: 500 }) }
    return response
  } catch (err) {
    console.error('[email-otp/verify] error:', err.message)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
