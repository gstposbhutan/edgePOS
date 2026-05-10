import { NextResponse } from 'next/server'
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
    const { name, whatsapp_no, tpn_gstin, email, password, full_name } = body

    // Validate required fields
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

    // 1. Create entity
    const { data: entity, error: entityErr } = await supabase
      .from('entities')
      .insert({
        name: name.trim(),
        role: 'WHOLESALER',
        whatsapp_no: cleanPhone,
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
      app_metadata: {
        role: 'WHOLESALER',
        sub_role: 'OWNER',
        entity_id: entity.id,
        permissions: OWNER_PERMISSIONS,
      },
    })

    if (authErr) {
      // Clean up entity if auth user creation fails
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
        role: 'WHOLESALER',
        sub_role: 'OWNER',
        full_name: full_name.trim(),
        permissions: OWNER_PERMISSIONS,
      })

    if (profileErr) {
      // Clean up both entity and auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('entities').delete().eq('id', entity.id)
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    // 4. Generate session tokens
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
    })

    if (linkErr || !linkData?.properties?.access_token) {
      // Account created but session generation failed — user can log in manually
      return NextResponse.json({
        success: true,
        warning: 'Account created. Please sign in with your credentials.',
      })
    }

    return NextResponse.json({
      success: true,
      access_token: linkData.properties.access_token,
      refresh_token: linkData.properties.refresh_token,
    })
  } catch (err) {
    console.error('Wholesaler signup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
