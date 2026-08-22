import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * DELETE /api/inventory/batches/[id] — owner-only batch removal.
 *
 * A batch can't be hard-deleted: inventory_movements.batch_id is RESTRICT and
 * products.current_stock is maintained solely by movement triggers. So removing
 * a batch = write it off through the ledger: post a reversing LOSS movement for
 * the batch's remaining quantity (the apply/sync triggers drop current_stock
 * and zero the batch), then mark the batch RECALLED. Stock stays correct and
 * the audit trail is preserved.
 */
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.subRole !== 'OWNER') return NextResponse.json({ error: 'Only the owner can delete batches' }, { status: 403 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx

    // Entity-scoped fetch so an owner can only ever touch their own batches.
    const { data: batch, error: fetchErr } = await supabase
      .from('product_batches')
      .select('id, product_id, entity_id, warehouse_id, batch_number, quantity, status')
      .eq('id', id).eq('entity_id', entityId).maybeSingle()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    if (batch.status === 'RECALLED') return NextResponse.json({ error: 'Batch already removed' }, { status: 409 })

    const remaining = Number(batch.quantity) || 0

    // Reverse remaining stock through the ledger (triggers update current_stock +
    // the batch quantity). Skip the movement when the batch is already empty.
    if (remaining !== 0) {
      const { error: mvErr } = await supabase.from('inventory_movements').insert({
        product_id:    batch.product_id,
        entity_id:     entityId,
        warehouse_id:  batch.warehouse_id ?? null,
        movement_type: 'LOSS',
        quantity:      -remaining,
        batch_id:      batch.id,
        created_by:    userId ?? null,
        notes:         `Batch ${batch.batch_number} deleted by owner`,
      })
      if (mvErr) return NextResponse.json({ error: mvErr.message }, { status: 500 })
    }

    const { error: upErr } = await supabase
      .from('product_batches').update({ status: 'RECALLED' })
      .eq('id', batch.id).eq('entity_id', entityId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, removedQuantity: remaining })
  } catch (err) {
    console.error('[inventory/batches DELETE] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
