import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/rider/auth/verify — rider email-OTP login step 2: verify the emailed code and, on success,
// sign the rider in (session stored as an httpOnly cookie, never exposed to browser JS).
const MAX_ATTEMPTS = 5

export async function POST(request) {
  try {
    const { email, otp } = await request.json()
    const em = (email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || !/^\d{6}$/.test(otp || '')) {
      return NextResponse.json({ error: 'Email and 6-digit code required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    if (!serviceClient) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    const mock = process.env.MOCK_WHATSAPP === 'true'

    // Verify the OTP.
    if (!(mock && otp === '123456')) {
      const { data: rec } = await serviceClient
        .from('email_otps').select('*').eq('email', em).eq('used', false)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single()
      if (!rec) return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 })
      if (rec.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
      const ok = await bcrypt.compare(otp, rec.otp_hash)
      if (!ok) {
        await serviceClient.from('email_otps').update({ attempts: rec.attempts + 1 }).eq('id', rec.id)
        return NextResponse.json({ error: 'Incorrect code' }, { status: 400 })
      }
      await serviceClient.from('email_otps').update({ used: true }).eq('id', rec.id)
    }

    // Resolve the rider account.
    const { data: rider } = await serviceClient
      .from('riders')
      .select('id, name, whatsapp_no, is_active, auth_user_id, auth_email, auth_password')
      .ilike('auth_email', em)
      .maybeSingle()
    if (!rider) return NextResponse.json({ error: 'No rider account found for this email' }, { status: 404 })
    if (!rider.is_active) return NextResponse.json({ error: 'Your account has been deactivated. Contact your admin.' }, { status: 403 })
    if (!rider.auth_user_id || !rider.auth_email || !rider.auth_password) {
      return NextResponse.json({ error: 'Account not fully set up. Contact your admin.' }, { status: 500 })
    }

    // Sign in via BFF — sets the httpOnly session cookie.
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const cookieStore = await cookies()
    const response = NextResponse.json({
      success: true,
      rider: { id: rider.id, name: rider.name, whatsapp_no: rider.whatsapp_no },
    })
    const ssr = createServerClient(url, key, {
      cookieOptions: { name: 'sb-edgepos-auth-token' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    })
    const { data: signIn, error: signErr } = await ssr.auth.signInWithPassword({
      email: rider.auth_email, password: rider.auth_password,
    })
    if (signErr || !signIn?.session) {
      console.error('[rider/auth/verify] signin failed:', signErr?.message)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }
    return response
  } catch (err) {
    console.error('[rider/auth/verify]', err.message)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
