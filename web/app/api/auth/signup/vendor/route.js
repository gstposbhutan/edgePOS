import { NextResponse } from 'next/server'
import { createServiceClient, getAuthContext } from '@/lib/supabase/server'

const OWNER_PERMISSIONS = [
  'pos:sale', 'inventory:read', 'inventory:write',
  'orders:read', 'orders:write', 'reports:read', 'reports:export',
  'users:read', 'users:write', 'settings:read', 'settings:write',
  'khata:read', 'khata:write',
]

export async function POST(request) {
  try {
    // Meeting 2026-08-11 (D7): vendor shops are created by an ADMINISTRATOR, not self-service.
    // This endpoint now requires a super-admin caller (it doubles as the admin "create vendor +
    // owner" tool); public self-registration is no longer allowed.
    const gate = await getAuthContext()
    if (!gate || gate.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Vendor shops are created by an administrator.' }, { status: 403 })
    }

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
      // app_metadata is the trusted set copied into the JWT — auth_entity_id() and role/permission
      // gates read it, so the entity claim MUST live here (not just user_metadata).
      app_metadata: {
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
      // Non-fatal: a Supabase query builder has no .catch(), so guard with try/catch instead.
      try {
        await supabase
          .from('owner_stores')
          .insert({ owner_id: authData.user.id, entity_id: entity.id, is_primary: true })
      } catch { /* owner_stores optional / not ready */ }
    }

    // 5. Admin-created — do NOT establish a vendor session (the super-admin caller stays signed
    //    in). The new owner signs in themselves with the credentials just created.
    return NextResponse.json({ success: true, role, entity_id: entity.id })
  } catch (err) {
    console.error('Vendor signup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
