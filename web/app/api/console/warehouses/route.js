import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// A wholesaler manages their own warehouses (buildings / depots) here. Records-only: name +
// address + a primary flag + an active flag. Every query is scoped to the caller's entity and
// gated to OWNER/MANAGER, the same shape as /api/console/catalog. Per-warehouse inventory is
// out of scope — entity-level stock stays the source of truth — so there is nothing to split
// by location here.

/** GET /api/console/warehouses — this entity's warehouses, primary first then by name. */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('warehouses')
      .select('id, name, address, is_primary, is_active, created_at, updated_at')
      .eq('entity_id', entityId)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ warehouses: data ?? [] })
  } catch (err) {
    console.error('[console/warehouses] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/warehouses — create one warehouse for this entity. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const body = await request.json()

    const name = (body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Warehouse name is required' }, { status: 400 })

    const isPrimary = !!body?.is_primary
    const isActive  = body?.is_active === undefined ? true : !!body.is_active

    // Only one primary per entity — clear the flag on the others first if this one's primary.
    if (isPrimary) {
      await supabase
        .from('warehouses')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('entity_id', entityId)
        .eq('is_primary', true)
    }

    const { data: warehouse, error } = await supabase
      .from('warehouses')
      .insert({
        entity_id:  entityId,
        name,
        address:    (body?.address ?? '').trim() || null,
        is_primary: isPrimary,
        is_active:  isActive,
      })
      .select('id, name, address, is_primary, is_active, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ warehouse }, { status: 201 })
  } catch (err) {
    console.error('[console/warehouses] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
