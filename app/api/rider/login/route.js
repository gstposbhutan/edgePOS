import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function POST(request) {
  try {
    const { phone, pin } = await request.json()

    if (!phone || !pin) {
      return NextResponse.json({ error: 'Phone number and PIN are required' }, { status: 400 })
    }

    const normalised = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`

    const serviceClient = createServiceClient()

    const { data: rider, error: riderError } = await serviceClient
      .from('riders')
      .select('id, name, whatsapp_no, pin_hash, is_active, auth_user_id')
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

    // Get the rider's email to sign them in
    const { data: { user }, error: userError } = await serviceClient.auth.admin.getUserById(rider.auth_user_id)
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication account not found' }, { status: 500 })
    }

    // Generate a magic link token for the rider to establish a session
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkError || !linkData) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      rider: { id: rider.id, name: rider.name, whatsapp_no: rider.whatsapp_no },
      access_token: linkData.properties.access_token,
      refresh_token: linkData.properties.refresh_token,
    })

  } catch (error) {
    console.error('[rider/login]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
