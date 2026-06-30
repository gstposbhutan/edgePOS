import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * PATCH / DELETE one of THIS entity's warehouses.
 *
 * Both operations are scoped `.eq('id', id).eq('entity_id', entityId)`, so a vendor can only
 * ever touch a warehouse they own — another entity's row simply matches nothing and returns a
 * 404. Mirrors the /api/console/catalog/[id] ownership model.
 */

/** PATCH /api/console/warehouses/[id] — update name / address / primary / active. */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const { entityId, supabase } = ctx
    const body = await request.json()

    // Only apply the fields that were actually sent (partial update).
    const patch = { updated_at: new Date().toISOString() }
    if (body?.name !== undefined) {
      const name = (body.name ?? '').trim()
      if (!name) return NextResponse.json({ error: 'Warehouse name is required' }, { status: 400 })
      patch.name = name
    }
    if (body?.address !== undefined)    patch.address    = (body.address ?? '').trim() || null
    if (body?.is_primary !== undefined) patch.is_primary = !!body.is_primary
    if (body?.is_active !== undefined)  patch.is_active  = !!body.is_active

    // Promoting this one to primary clears the flag on the entity's other warehouses.
    if (patch.is_primary === true) {
      await supabase
        .from('warehouses')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('entity_id', entityId)
        .eq('is_primary', true)
        .neq('id', id)
    }

    const { data: updated, error } = await supabase
      .from('warehouses')
      .update(patch)
      .eq('id', id)
      .eq('entity_id', entityId)
      .select('id, name, address, is_primary, is_active, created_at, updated_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    return NextResponse.json({ warehouse: updated[0] })
  } catch (err) {
    console.error('[console/warehouses/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/console/warehouses/[id] — remove one of this entity's warehouses. */
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const { entityId, supabase } = ctx

    const { data: deleted, error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', id)
      .eq('entity_id', entityId)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[console/warehouses/[id]] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
