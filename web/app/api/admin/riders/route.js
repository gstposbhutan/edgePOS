import { NextResponse } from 'next/server'
import { getAuthContext, createServiceClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

// GET — list all riders
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Riders are a platform-wide pool managed by the super-admin (the table has no
    // entity_id column — they are not tenant-scoped).
    const supabase = ctx.supabase
    const { data: riders, error } = await supabase
      .from('riders')
      .select('id, name, whatsapp_no, is_active, is_available, current_order_id, created_at, email_notifications_enabled')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ riders: riders || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — create rider
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, whatsapp_no, pin } = await request.json()

    if (!name?.trim() || !whatsapp_no?.trim() || !pin) {
      return NextResponse.json({ error: 'Name, WhatsApp number, and PIN are required' }, { status: 400 })
    }
    if (String(pin).length < 4) {
      return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 })
    }

    const phone = whatsapp_no.trim().startsWith('+') ? whatsapp_no.trim() : `+${whatsapp_no.trim()}`
    const supabase = ctx.supabase

    // Create auth user for the rider
    const tempEmail = `rider_${Date.now()}@nexusbhutan.internal`
    const tempPassword = 'RiderPass' + Math.random().toString(36).substring(2, 10) + Date.now().toString().slice(-4)

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: 'RIDER', phone },
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Failed to create auth account: ' + (authError?.message ?? 'Unknown') }, { status: 500 })
    }

    const pinHash = await bcrypt.hash(String(pin), 10)

    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .insert({
        name:          name.trim(),
        whatsapp_no:   phone,
        pin_hash:      pinHash,
        auth_user_id:  authData.user.id,
        auth_email:    tempEmail,
        auth_password: tempPassword,
        is_active:     true,
        is_available:  true,
      })
      .select('id, name, whatsapp_no, is_active, is_available')
      .single()

    if (riderError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Failed to create rider: ' + riderError.message }, { status: 500 })
    }

    return NextResponse.json({ rider })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
