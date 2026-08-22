import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// SUPER_ADMIN-global entity management (any type). Distinct from /api/admin/stores
// (RETAILER + owner-scoped) and /api/admin/team (entity-scoped staff).
const SUPER = 'SUPER_ADMIN'
const CREATABLE_ROLES = ['DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'] // not SUPER_ADMIN

// GET /api/admin/entities[?role=] — list ALL entities (optionally filtered by role).
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const roleFilter = new URL(request.url).searchParams.get('role')
  let q = ctx.supabase
    .from('entities')
    .select('id, name, role, tpn_gstin, whatsapp_no, address, credit_limit, is_active, is_featured, created_at, nqrc_enabled, nqrc_merchant_name, nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag')
    .order('role', { ascending: true })
    .order('name', { ascending: true })
  if (roleFilter) q = q.eq('role', roleFilter)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entities: data || [] })
}

// POST /api/admin/entities — create a commercial entity of any (non-super-admin) role.
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = (body.name || '').trim()
  const role = (body.role || '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!CREATABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${CREATABLE_ROLES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from('entities')
    .insert({
      name,
      role,
      tpn_gstin: body.tpn_gstin?.trim() || null,
      whatsapp_no: body.whatsapp_no?.trim() || null,
      address: body.address?.trim() || null,
      credit_limit: body.credit_limit != null && body.credit_limit !== '' ? Number(body.credit_limit) : null,
      is_active: true,
    })
    .select('id, name, role, tpn_gstin, whatsapp_no, address, credit_limit, is_active, is_featured, created_at')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'TPN/GSTIN or WhatsApp already registered' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entity: data }, { status: 201 })
}
