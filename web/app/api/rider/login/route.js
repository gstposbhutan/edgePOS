import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(request) {
  try {
    const { phone, pin } = await request.json()

    if (!phone || !pin) {
      return NextResponse.json({ error: 'Phone number and PIN are required' }, { status: 400 })
    }

    const normalised = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`

    const serviceClient = createAdminClient()

    const { data: rider, error: riderError } = await serviceClient
      .from('riders')
      .select('id, name, whatsapp_no, pin_hash, is_active, auth_user_id, auth_email, auth_password')
      .eq('whatsapp_no', normalised)
      .single()

    if (riderError || !rider) {
      return NextResponse.json({ error: 'Invalid phone number or PIN' }, { status: 401 })
    }

    if (!rider.is_active) {
      return NextResponse.json({ error: 'Your account has been deactivated. Contact admin.' }, { status: 403 })
    }

    const valid = await bcrypt.compare(String(pin), rider.pin_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid phone number or PIN' }, { status: 401 })
    }

    if (!rider.auth_user_id) {
      return NextResponse.json({ error: 'Account not fully set up. Contact admin.' }, { status: 500 })
    }

    if (!rider.auth_email || !rider.auth_password) {
      return NextResponse.json({ error: 'Account not fully set up. Contact admin.' }, { status: 500 })
    }

    // Sign in using stored credentials — works for both seeded and API-created users
    const anonClient = createAnonClient()
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email:    rider.auth_email,
      password: rider.auth_password,
    })

    if (signInError || !signInData?.session) {
      console.error('[rider/login] signInWithPassword failed:', signInError?.message)
      return NextResponse.json({ error: 'Failed to create session: ' + (signInError?.message ?? 'unknown') }, { status: 500 })
    }

    return NextResponse.json({
      success:       true,
      rider:         { id: rider.id, name: rider.name, whatsapp_no: rider.whatsapp_no },
      access_token:  signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    })

  } catch (error) {
    console.error('[rider/login]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
