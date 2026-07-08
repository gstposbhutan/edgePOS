import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/notify'

// POST /api/rider/auth/send — rider email-OTP login step 1: email a 6-digit login code (the "PIN"),
// but only to a registered, active rider. MOCK_WHATSAPP=true short-circuits to the universal 123456.
const OTP_TTL_MIN = 10

export async function POST(request) {
  try {
    const { email } = await request.json()
    const em = (email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    // Only registered, active riders can log in.
    const { data: rider } = await supabase
      .from('riders').select('id, is_active').ilike('auth_email', em).maybeSingle()
    if (!rider) {
      return NextResponse.json({ error: 'No rider account found for this email. Contact your admin.' }, { status: 404 })
    }
    if (!rider.is_active) {
      return NextResponse.json({ error: 'Your account has been deactivated. Contact your admin.' }, { status: 403 })
    }

    const mock = process.env.MOCK_WHATSAPP === 'true'
    const otp = mock ? '123456' : String(Math.floor(100000 + Math.random() * 900000))
    const otp_hash = await bcrypt.hash(otp, 10)

    await supabase.from('email_otps').insert({
      email: em,
      otp_hash,
      expires_at: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString(),
    })

    if (!mock) {
      const r = await sendEmail(
        em,
        'Your Pelbu Rider login code',
        `Your Pelbu Rider login code is: ${otp}\n\nIt expires in ${OTP_TTL_MIN} minutes. If you didn't request this, ignore this email.`,
      )
      if (r?.skipped) return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 503 })
    }

    return NextResponse.json({ success: true, ...(mock ? { otp } : {}) })
  } catch (err) {
    console.error('[rider/auth/send]', err.message)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}
