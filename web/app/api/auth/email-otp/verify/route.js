import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/auth/email-otp/verify — CUSTOMER SIGN-UP completion. The OTP verifies the email; the
// customer also sets a strong password + phone (both mandatory). Creates the account and signs in
// with the password. Returning customers sign in with email+password (via /api/auth/login), not this.
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
    const { email, otp, password, phone } = await request.json()
    const em = (email || '').trim().toLowerCase()
    const ph = (phone || '').replace(/\s/g, '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || !/^\d{6}$/.test(otp || '')) {
      return NextResponse.json({ error: 'Email and 6-digit code required' }, { status: 400 })
    }
    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters with a letter and a number' }, { status: 400 })
    }
    if (!/^\+?[0-9]{8,15}$/.test(ph)) {
      return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const mock = process.env.MOCK_WHATSAPP === 'true'

    // Verify the email OTP.
    if (!(mock && otp === '123456')) {
      const { data: rec } = await supabase
        .from('email_otps').select('*').eq('email', em).eq('used', false)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single()
      if (!rec) return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 })
      if (rec.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
      const ok = await bcrypt.compare(otp, rec.otp_hash)
      if (!ok) { await supabase.from('email_otps').update({ attempts: rec.attempts + 1 }).eq('id', rec.id); return NextResponse.json({ error: 'Incorrect code' }, { status: 400 }) }
      await supabase.from('email_otps').update({ used: true }).eq('id', rec.id)
    }

    // Sign-up only: reject if the email is already registered.
    if (await findUserByEmail(supabase, em)) {
      return NextResponse.json({ error: 'This email already has an account — please sign in.' }, { status: 409 })
    }

    // Create the customer with the chosen password + phone.
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: em, password, email_confirm: true, user_metadata: { phone: ph, phone_verified: true, role: 'CUSTOMER' },
    })
    if (authErr || !authData?.user) return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
    const uid = authData.user.id
    const name = em.split('@')[0]
    const { error: entErr } = await supabase.from('entities').insert({ id: uid, name, role: 'CUSTOMER', is_active: true, whatsapp_no: ph })
    if (entErr) { await supabase.auth.admin.deleteUser(uid); return NextResponse.json({ error: 'Could not create account' }, { status: 500 }) }
    await supabase.from('user_profiles').insert({ id: uid, entity_id: uid, role: 'CUSTOMER', sub_role: 'CUSTOMER', full_name: name })
    await supabase.auth.admin.updateUserById(uid, { app_metadata: { role: 'CUSTOMER', sub_role: 'CUSTOMER', entity_id: uid } })

    // Sign in with the new password to set the session cookies.
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const cookieStore = await cookies()
    const response = NextResponse.json({ success: true })
    const ssr = createServerClient(url, key, {
      cookieOptions: { name: 'sb-edgepos-auth-token' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    })
    const { error: sErr } = await ssr.auth.signInWithPassword({ email: em, password })
    if (sErr) { console.error('[email-otp/verify] signin failed:', sErr.message); return NextResponse.json({ error: 'Account created — please sign in.' }, { status: 200 }) }
    return response
  } catch (err) {
    console.error('[email-otp/verify] error:', err.message)
    return NextResponse.json({ error: 'Sign-up failed' }, { status: 500 })
  }
}
