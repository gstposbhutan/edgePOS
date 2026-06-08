import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

const OWNER_PERMISSIONS = [
  'pos:sale', 'inventory:read', 'inventory:write',
  'orders:read', 'orders:write', 'reports:read', 'reports:export',
  'users:read', 'users:write', 'settings:read', 'settings:write',
  'khata:read', 'khata:write',
]

export async function POST(request) {
  try {
    const body = await request.json()
    const { role, name, whatsapp_no, tpn_gstin, email, password, full_name } = body

    if (!['RETAILER', 'WHOLESALER', 'DISTRIBUTOR'].includes(role)) {
      return NextResponse.json({ error: 'Role must be RETAILER, WHOLESALER or DISTRIBUTOR' }, { status: 400 })
    }
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Business name is required (min 2 characters)' }, { status: 400 })
    }
    if (!whatsapp_no || !/^\+?[0-9]{8,15}$/.test(whatsapp_no.replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Valid WhatsApp number required (e.g. +97517123456)' }, { status: 400 })
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    if (!full_name || full_name.trim().length < 2) {
      return NextResponse.json({ error: 'Your full name is required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const cleanPhone = whatsapp_no.replace(/\s/g, '')
    const normalPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`

    // 1. Create entity
    const { data: entity, error: entityErr } = await supabase
      .from('entities')
      .insert({
        name: name.trim(),
        role,
        whatsapp_no: normalPhone,
        tpn_gstin: tpn_gstin?.trim() || null,
        is_active: true,
      })
      .select('id')
      .single()

    if (entityErr) {
      if (entityErr.code === '23505') {
        const field = entityErr.message.includes('tpn_gstin') ? 'TPN/GSTIN' : 'WhatsApp number'
        return NextResponse.json({ error: `${field} is already registered` }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create business account' }, { status: 500 })
    }

    // 2. Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        role,
        sub_role: 'OWNER',
        entity_id: entity.id,
        permissions: OWNER_PERMISSIONS,
      },
    })

    if (authErr) {
      await supabase.from('entities').delete().eq('id', entity.id)
      if (authErr.message?.includes('already registered')) {
        return NextResponse.json({ error: 'Email address is already registered' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
    }

    // 3. Create user profile
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        entity_id: entity.id,
        role,
        sub_role: 'OWNER',
        full_name: full_name.trim(),
        permissions: OWNER_PERMISSIONS,
      })

    if (profileErr) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('entities').delete().eq('id', entity.id)
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    // 4. RETAILER owners link to owner_stores for the multi-store selector (N/A for wholesaler/distributor)
    if (role === 'RETAILER') {
      await supabase
        .from('owner_stores')
        .insert({ owner_id: authData.user.id, entity_id: entity.id, is_primary: true })
        .catch(() => {}) // non-fatal if owner_stores table not ready
    }

    // 5. Establish session via httpOnly cookie (BFF pattern)
    const cookieStore = await cookies()
    let response = NextResponse.json({ success: true, role })

    const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!sbUrl || !sbKey) {
      // Account created but can't set session cookie — redirect to login
      return NextResponse.json({ success: true, role, warning: 'Account created. Please sign in.' })
    }

    const sessionClient = createServerClient(sbUrl, sbKey, {
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

    // Sign in with the newly created credentials to establish a session
    const { error: sessionErr } = await sessionClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (sessionErr) {
      // Account was created successfully, just can't auto-session
      return NextResponse.json({ success: true, role, warning: 'Account created. Please sign in.' })
    }

    return response
  } catch (err) {
    console.error('Vendor signup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
