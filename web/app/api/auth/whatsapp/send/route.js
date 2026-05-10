import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

const RATE_LIMIT_WINDOW = 10 * 60 * 1000 // 10 minutes
const RATE_LIMIT_MAX = 3
const OTP_EXPIRY = 5 * 60 * 1000 // 5 minutes
const MOCK_OTP = '123456' // Universal OTP for demo/testing

export async function POST(request) {
  try {
    const { phone } = await request.json()

    if (!phone || !/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    const normalizedPhone = phone.replace(/\s/g, '')
    const supabase = createServiceClient()
    const isMockMode = process.env.MOCK_WHATSAPP === 'true'

    // Rate limit: max 3 OTPs per phone per 10 minutes (skip in mock mode)
    if (!isMockMode) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString()
      const { count } = await supabase
        .from('whatsapp_otps')
        .select('*', { count: 'exact', head: true })
        .eq('phone', normalizedPhone)
        .gte('created_at', since)

      if (count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { error: 'Too many requests. Try again in 10 minutes.' },
          { status: 429 }
        )
      }
    }

    // Generate OTP (use fixed OTP in mock mode)
    const otp = isMockMode ? MOCK_OTP : String(Math.floor(100000 + Math.random() * 900000))
    const otpHash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY).toISOString()

    // Invalidate any previous unused OTPs for this phone
    await supabase
      .from('whatsapp_otps')
      .update({ used: true })
      .eq('phone', normalizedPhone)
      .eq('used', false)

    // Store new OTP
    const { error: insertError } = await supabase
      .from('whatsapp_otps')
      .insert({
        phone: normalizedPhone,
        otp_hash: otpHash,
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('OTP insert failed:', insertError)
      return NextResponse.json(
        { error: 'Failed to send OTP' },
        { status: 500 }
      )
    }

    // MOCK MODE: Return OTP in response for easy testing
    if (isMockMode) {
      console.log(`[MOCK WhatsApp OTP] Phone: ${normalizedPhone}, OTP: ${otp}`)
      return NextResponse.json({
        success: true,
        mock: true,
        otp: otp, // Include OTP in response for demo
        message: `Mock mode: Use OTP ${otp} to verify`
      })
    }

    // PRODUCTION: Send OTP via whatsapp-gateway
    try {
      const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
      await fetch(`${gatewayUrl}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, otp }),
      })
    } catch (gatewayError) {
      console.error('WhatsApp gateway unreachable:', gatewayError)
      // In development, log the OTP so it can be tested without gateway
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] WhatsApp OTP for ${normalizedPhone}: ${otp}`)
        // Return OTP in dev mode for easier testing when gateway is down
        return NextResponse.json({
          success: true,
          dev: true,
          otp: otp,
          message: `Gateway unavailable - DEV mode: Use OTP ${otp}`
        })
      }
    }

    // Always return success — never reveal whether phone exists
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('WhatsApp send OTP error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
