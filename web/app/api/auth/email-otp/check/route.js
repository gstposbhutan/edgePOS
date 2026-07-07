import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/auth/email-otp/check — verify an email OTP WITHOUT creating/logging in a user.
// Used for in-store identity checks (e.g. authorising a credit sale). MOCK_WHATSAPP=true
// accepts the universal 123456.
export async function POST(request) {
  try {
    const { email, otp } = await request.json()
    const em = (email || '').trim().toLowerCase()
    const code = String(otp || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 })

    if (process.env.MOCK_WHATSAPP === 'true' && code === '123456') {
      return NextResponse.json({ success: true })
    }

    const supabase = createServiceClient()
    const { data: rows } = await supabase
      .from('email_otps')
      .select('otp_hash, expires_at')
      .eq('email', em)
      .order('created_at', { ascending: false })
      .limit(1)

    const row = rows?.[0]
    if (!row || new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 })
    }
    const ok = await bcrypt.compare(code, row.otp_hash)
    if (!ok) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[email-otp/check] error:', err.message)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
