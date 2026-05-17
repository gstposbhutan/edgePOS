import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/inventory/emergency-restock
 *
 * Emergency restock during checkout — creates a product batch and records
 * an inventory movement. Used by stock-gate-modal.
 *
 * Body:
 *   product_id     - UUID (required)
 *   entity_id      - UUID (required)
 *   batch_number   - string (required)
 *   barcode        - string (optional)
 *   manufactured_at - date string (optional)
 *   expires_at     - date string (optional)
 *   quantity       - integer (required)
 *   notes          - string (optional)
 */
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    product_id,
    entity_id,
    batch_number,
    barcode,
    manufactured_at,
    expires_at,
    quantity,
    notes,
  } = body

  if (!product_id)  return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  if (!entity_id)   return NextResponse.json({ error: 'entity_id is required' }, { status: 400 })
  if (!batch_number?.trim()) return NextResponse.json({ error: 'Batch number is required' }, { status: 400 })
  if (!quantity || quantity <= 0) return NextResponse.json({ error: 'Quantity must be > 0' }, { status: 400 })

  // Verify entity matches user's entity
  if (entity_id !== ctx.entityId) {
    return NextResponse.json({ error: 'Entity mismatch' }, { status: 403 })
  }

  const supabase = ctx.supabase

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from('product_batches')
    .insert({
      product_id,
      entity_id,
      batch_number: batch_number.trim(),
      barcode: barcode?.trim() || null,
      manufactured_at: manufactured_at || null,
      expires_at: expires_at || null,
      quantity: 0, // trigger will set from movement below
      status: 'ACTIVE',
      notes: notes || null,
    })
    .select('id, batch_number')
    .single()

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 })
  }

  // Record inventory movement
  const { error: movError } = await supabase
    .from('inventory_movements')
    .insert({
      product_id,
      entity_id,
      movement_type: 'RESTOCK',
      quantity,
      batch_id: batch.id,
      created_by: ctx.userId,
      notes: notes || `Emergency restock: batch ${batch_number}`,
    })

  if (movError) {
    // Compensate: remove the batch we just created
    await supabase.from('product_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: movError.message }, { status: 500 })
  }

  return NextResponse.json({ batch }, { status: 201 })
}
