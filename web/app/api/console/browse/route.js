import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { linkLookup } from '@/lib/console/supply-links'

// Network discovery for the vendor consoles. A distributor browses every active WHOLESALER
// and RETAILER on the platform; a wholesaler browses every active RETAILER. Broad by design
// (not category-scoped yet) — searchable by name, and each row carries whether the caller has
// already favourited it so the browse list and the Saved list stay in sync.
//
// Allowed target roles per caller (anything else is rejected 403):
//   DISTRIBUTOR → WHOLESALER, RETAILER
//   WHOLESALER  → RETAILER
const ALLOWED_TARGETS = {
  DISTRIBUTOR: ['WHOLESALER', 'RETAILER'],
  WHOLESALER:  ['RETAILER'],
}

/** GET /api/console/browse?role=WHOLESALER|RETAILER&search= — active entities of that role */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only the two vendor consoles browse the network.
    const allowed = ALLOWED_TARGETS[ctx.role]
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const targetRole = (searchParams.get('role') || '').toUpperCase()
    const search     = (searchParams.get('search') || '').trim()

    if (!targetRole) return NextResponse.json({ error: 'role is required' }, { status: 400 })
    // A wholesaler asking for wholesalers (or anything but retailers) is rejected here.
    if (!allowed.includes(targetRole)) {
      return NextResponse.json({ error: `${ctx.role} may not browse ${targetRole}` }, { status: 403 })
    }

    const { entityId, supabase } = ctx

    let query = supabase
      .from('entities')
      .select('id, name, address, whatsapp_no, tpn_gstin, marketplace_logo_url')
      .eq('role', targetRole)
      .eq('is_active', true)
      .neq('id', entityId)        // never list the caller's own entity
      .neq('role', 'SUPER_ADMIN') // belt-and-suspenders; role filter already excludes it
      .order('name')

    if (search) query = query.ilike('name', `%${search}%`)

    const { data: entities, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Mark which of these the caller already saved. One read of their favourites, then a
    // set membership test — avoids an N+1 of per-row lookups.
    const { data: favs } = await supabase
      .from('favourites')
      .select('target_entity_id')
      .eq('actor_entity_id', entityId)
    const favSet = new Set((favs ?? []).map(f => f.target_entity_id))

    // Mark which rows the caller already has an active whole-catalog supply link with, when this
    // pair is linkable (distributor→wholesaler, wholesaler→retailer). Distributor→retailer isn't a
    // supply link, so those rows stay favourite-only (linkable false).
    const lk = linkLookup(ctx.role, targetRole)
    let linkedSet = new Set()
    if (lk && (entities?.length)) {
      const { data: links } = await supabase
        .from(lk.table)
        .select(lk.other)
        .eq(lk.self, entityId).eq('active', true).is('category_id', null)
        .in(lk.other, entities.map(e => e.id))
      linkedSet = new Set((links ?? []).map(l => l[lk.other]))
    }

    const rows = (entities ?? []).map(e => ({
      ...e,
      is_favourite: favSet.has(e.id),
      linkable: !!lk,
      is_linked: linkedSet.has(e.id),
    }))

    return NextResponse.json({ entities: rows })
  } catch (err) {
    console.error('[console/browse] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
