import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
    if (!serviceClient) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

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

    // Sign in via BFF — session stored as httpOnly cookie, never exposed to browser JS
    const cookieStore = await cookies()
    let response = NextResponse.json({
      success: true,
      rider: { id: rider.id, name: rider.name, whatsapp_no: rider.whatsapp_no },
    })

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createServerClient(url, key, {
      cookieOptions: { name: 'sb-edgepos-auth-token' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email:    rider.auth_email,
      password: rider.auth_password,
    })

    if (signInError || !signInData?.session) {
      console.error('[rider/login] signInWithPassword failed:', signInError?.message)
      return NextResponse.json({ error: 'Failed to create session: ' + (signInError?.message ?? 'unknown') }, { status: 500 })
    }

    return response

  } catch (error) {
    console.error('[rider/login]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
