import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/lib/riders/dispatch'

// Is this phone already in use by any user (business, customer, rider, or khata debtor)?
// Returns a human label of where it clashes, or null.
async function phoneInUse(supabase, phone) {
  const checks = [
    ['entities',          'whatsapp_no',   'another business'],
    ['consumer_accounts', 'phone',         'a customer'],
    ['riders',            'whatsapp_no',   'another rider'],
    ['khata_accounts',    'debtor_phone',  'a credit customer'],
  ]
  for (const [table, col, label] of checks) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, phone)
    if (count && count > 0) return label
  }
  return null
}

// GET — list all riders (platform-wide pool) with their live active-order count.
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = ctx.supabase
    const { data: riders, error } = await supabase
      .from('riders')
      .select('id, name, whatsapp_no, auth_email, is_active, is_available, created_at, email_notifications_enabled')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Attach active-order count per rider (their current queue depth).
    const ids = (riders || []).map(r => r.id)
    const counts = new Map(ids.map(id => [id, 0]))
    if (ids.length) {
      const { data: active } = await supabase
        .from('orders').select('rider_id').in('rider_id', ids).in('status', ACTIVE_STATUSES)
      for (const o of active || []) counts.set(o.rider_id, (counts.get(o.rider_id) || 0) + 1)
    }
    const withCounts = (riders || []).map(r => ({ ...r, active_orders: counts.get(r.id) || 0 }))

    return NextResponse.json({ riders: withCounts })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — register a rider: name + real email (login identity) + mandatory, unique phone. No PIN.
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const name = (body.name || '').trim()
    const email = (body.email || '').trim().toLowerCase()
    const rawPhone = (body.whatsapp_no || '').trim()

    if (!name || !email || !rawPhone) {
      return NextResponse.json({ error: 'Name, email, and phone number are required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }
    const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
    if (!/^\+[0-9]{8,15}$/.test(phone)) {
      return NextResponse.json({ error: 'A valid phone number is required (e.g. +97517123456)' }, { status: 400 })
    }

    const supabase = ctx.supabase

    // Phone must be unique across ALL users.
    const clash = await phoneInUse(supabase, phone)
    if (clash) {
      return NextResponse.json({ error: `That phone number is already registered to ${clash}.` }, { status: 409 })
    }

    // Create the auth user with the rider's REAL email (their login identity). A random password backs
    // the server-side sign-in after email-OTP; the rider never types it.
    const authPassword = 'Rider#' + Math.random().toString(36).slice(2, 12) + Date.now().toString().slice(-4)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
      user_metadata: { role: 'RIDER', name, phone },
    })
    if (authError || !authData?.user) {
      const msg = /already|registered|exist/i.test(authError?.message || '')
        ? 'That email is already in use by another account.'
        : 'Failed to create auth account: ' + (authError?.message ?? 'Unknown')
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .insert({
        name,
        whatsapp_no:   phone,
        auth_user_id:  authData.user.id,
        auth_email:    email,
        auth_password: authPassword,
        is_active:     true,
        is_available:  true,
      })
      .select('id, name, whatsapp_no, auth_email, is_active, is_available, email_notifications_enabled')
      .single()

    if (riderError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Failed to create rider: ' + riderError.message }, { status: 500 })
    }

    return NextResponse.json({ rider: { ...rider, active_orders: 0 } })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
