import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET — list stores the caller owns or all stores (SUPER_ADMIN)
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, role, entityId, supabase } = ctx

    if (role === 'SUPER_ADMIN') {
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
      .eq('owner_id', userId)

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
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, role, supabase } = ctx
    if (role !== 'SUPER_ADMIN' && role !== 'RETAILER') {
      return NextResponse.json({ error: 'Only owners can create stores' }, { status: 403 })
    }

    const { name, tpn_gstin, whatsapp_no } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Store name is required' }, { status: 400 })

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
      .eq('owner_id', userId)

    await supabase
      .from('owner_stores')
      .insert({ owner_id: userId, entity_id: entity.id, is_primary: (count ?? 0) === 0 })

    return NextResponse.json({ store: entity })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
