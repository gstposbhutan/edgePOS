import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const authClient = createSSRServiceClient()
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return null
  const supabase = createBypassClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, sub_role, entity_id')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  const canManage = profile.role === 'SUPER_ADMIN' || profile.sub_role === 'OWNER'
  if (!canManage) return null
  return { user, profile }
}

// GET — list stores the caller owns or all stores (SUPER_ADMIN)
export async function GET(request) {
  try {
    const auth = await getAuthUser(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createBypassClient()

    if (auth.profile.role === 'SUPER_ADMIN') {
      // Admin sees all retailer entities
      const { data: entities } = await supabase
        .from('entities')
        .select('id, name, tpn_gstin, whatsapp_no, is_active, role')
        .eq('role', 'RETAILER')
        .order('name')
      return NextResponse.json({ stores: entities || [] })
    }

    // Owner sees only their linked stores
    const { data } = await supabase
      .from('owner_stores')
      .select('entity_id, is_primary, entities!inner(id, name, tpn_gstin, whatsapp_no, is_active)')
      .eq('owner_id', auth.user.id)

    return NextResponse.json({
      stores: (data || []).map(r => ({ ...r.entities, is_primary: r.is_primary }))
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — owner creates a new store (entity + owner_stores link)
export async function POST(request) {
  try {
    const auth = await getAuthUser(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, tpn_gstin, whatsapp_no } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Store name is required' }, { status: 400 })

    const supabase = createBypassClient()

    const { data: entity, error: entityErr } = await supabase
      .from('entities')
      .insert({ name: name.trim(), tpn_gstin: tpn_gstin?.trim() || null, whatsapp_no: whatsapp_no?.trim() || null, role: 'RETAILER', is_active: true })
      .select('id, name, tpn_gstin, whatsapp_no, is_active')
      .single()

    if (entityErr) return NextResponse.json({ error: entityErr.message }, { status: 500 })

    // Check if this is their first store (make primary)
    const { count } = await supabase
      .from('owner_stores')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', auth.user.id)

    await supabase
      .from('owner_stores')
      .insert({ owner_id: auth.user.id, entity_id: entity.id, is_primary: (count ?? 0) === 0 })

    return NextResponse.json({ store: entity })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
