import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/server'

const MAX_ATTEMPTS = 3

export async function POST(request) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: 'Phone number and 6-digit OTP required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Find the most recent unused, non-expired OTP for this phone
    const { data: otpRecord, error: fetchError } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: 'OTP expired or not found. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check max attempts
    if (otpRecord.attempt_count >= MAX_ATTEMPTS) {
      await supabase
        .from('whatsapp_otps')
        .update({ used: true })
        .eq('id', otpRecord.id)

      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new OTP.' },
        { status: 400 }
      )
    }

    // Verify OTP
    const valid = await bcrypt.compare(otp, otpRecord.otp_hash)

    if (!valid) {
      await supabase
        .from('whatsapp_otps')
        .update({ attempt_count: otpRecord.attempt_count + 1 })
        .eq('id', otpRecord.id)

      const remaining = MAX_ATTEMPTS - otpRecord.attempt_count - 1
      return NextResponse.json(
        { error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
        { status: 400 }
      )
    }

    // Mark OTP as used
    await supabase
      .from('whatsapp_otps')
      .update({ used: true })
      .eq('id', otpRecord.id)

    // Look up user by WhatsApp phone
    // entities.whatsapp_no stores the business phone
    // For login, we match against user_profiles or entities
    const { data: entity } = await supabase
      .from('entities')
      .select('id, name')
      .eq('whatsapp_no', phone)
      .single()

    if (!entity) {
      return NextResponse.json(
        { error: 'No account found for this phone number.' },
        { status: 404 }
      )
    }

    // Find a user_profile for this entity
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('entity_id', entity.id)
      .limit(1)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'No user account linked to this phone number.' },
        { status: 404 }
      )
    }

    // Generate a Supabase session for this user using admin API
    // Look up the auth.users email for this profile
    const { data: { users } } = await supabase.auth.admin.listUsers()

    const authUser = users.find(u => u.id === profile.id)

    if (!authUser) {
      return NextResponse.json(
        { error: 'Authentication account not found.' },
        { status: 404 }
      )
    }

    // Generate magic link to obtain session
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: authUser.email,
      })

    if (linkError || !linkData) {
      console.error('Generate link failed:', linkError)
      return NextResponse.json(
        { error: 'Failed to create session.' },
        { status: 500 }
      )
    }

    // Return the session tokens for the client to set
    return NextResponse.json({
      success: true,
      access_token: linkData.properties.access_token,
      refresh_token: linkData.properties.refresh_token,
      expires_at: linkData.properties.expires_at,
    })
  } catch (err) {
    console.error('WhatsApp verify OTP error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
