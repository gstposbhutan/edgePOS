import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/notify'

// POST /api/auth/email-otp/send — customer email-OTP login/signup: generate a 6-digit code, store it
// hashed, and email it via SendGrid. MOCK_WHATSAPP=true short-circuits to the universal 123456.
const OTP_TTL_MIN = 10

export async function POST(request) {
  try {
    const { email } = await request.json()
    const em = (email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    const supabase = createServiceClient()
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
        'Your Pelbu login code',
        `Your Pelbu verification code is: ${otp}\n\nIt expires in ${OTP_TTL_MIN} minutes. If you didn't request this, you can ignore this email.`,
      )
      if (r?.skipped) return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 503 })
    }

    return NextResponse.json({ success: true, ...(mock ? { otp } : {}) })
  } catch (err) {
    console.error('[email-otp/send] error:', err.message)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}
