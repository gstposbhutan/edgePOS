import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/draft-purchases/[id]
 * Fetch a single draft purchase with items.
 */
export async function GET(_request, { params }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('draft_purchases')
    .select('*, draft_purchase_items(*, products(id, name, sku))')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json({ draft: data })
}

/**
 * PATCH /api/draft-purchases/[id]
 * Update draft items (product matches, quantities, prices) or supplier name.
 * Body: { items?: [{id, product_id?, quantity?, unit_price?, match_status?}], supplier_name?, notes? }
 */
export async function PATCH(request, { params }) {
  const { id } = await params
  const body = await request.json()
  const supabase = createServiceClient()

  // Verify draft is in DRAFT or REVIEWED status
  const { data: draft } = await supabase
    .from('draft_purchases')
    .select('status')
    .eq('id', id)
    .single()

  if (!draft || !['DRAFT', 'REVIEWED'].includes(draft.status)) {
    return NextResponse.json({ error: 'Draft is not editable' }, { status: 400 })
  }

  // Update individual items
  if (body.items && Array.isArray(body.items)) {
    for (const item of body.items) {
      const updates = {}
      if (item.product_id !== undefined) updates.product_id = item.product_id
      if (item.quantity !== undefined) updates.quantity = item.quantity
      if (item.unit_price !== undefined) updates.unit_price = item.unit_price
      if (item.total_price !== undefined) updates.total_price = item.total_price
      if (item.match_status !== undefined) updates.match_status = item.match_status

      if (Object.keys(updates).length > 0) {
        await supabase.from('draft_purchase_items').update(updates).eq('id', item.id)
      }
    }
  }

  // Update draft-level fields
  const draftUpdates = { updated_at: new Date().toISOString() }
  if (body.supplier_name !== undefined) draftUpdates.supplier_name = body.supplier_name
  if (body.notes !== undefined) draftUpdates.notes = body.notes

  await supabase.from('draft_purchases').update(draftUpdates).eq('id', id)

  // Recalculate total
  const { data: allItems } = await supabase
    .from('draft_purchase_items')
    .select('total_price')
    .eq('draft_purchase_id', id)

  const total = (allItems ?? []).reduce((sum, i) => sum + parseFloat(i.total_price || 0), 0)
  await supabase.from('draft_purchases').update({ total_amount: parseFloat(total.toFixed(2)) }).eq('id', id)

  // Return updated draft
  const { data: updated } = await supabase
    .from('draft_purchases')
    .select('*, draft_purchase_items(*, products(id, name, sku))')
    .eq('id', id)
    .single()

  return NextResponse.json({ draft: updated })
}

/**
 * POST /api/draft-purchases/[id]
 * Confirm or cancel a draft purchase.
 * Body: { action: 'confirm' | 'cancel' }
 */
export async function POST(request, { params }) {
  const { id } = await params
  const { action } = await request.json()
  const supabase = createServiceClient()

  const { data: draft } = await supabase
    .from('draft_purchases')
    .select('*, draft_purchase_items(*)')
    .eq('id', id)
    .single()

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (action === 'cancel') {
    if (!['DRAFT', 'REVIEWED'].includes(draft.status)) {
      return NextResponse.json({ error: 'Cannot cancel this draft' }, { status: 400 })
    }
    await supabase
      .from('draft_purchases')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ success: true })
  }

  if (action === 'confirm') {
    if (!['DRAFT', 'REVIEWED'].includes(draft.status)) {
      return NextResponse.json({ error: 'Cannot confirm this draft' }, { status: 400 })
    }

    // Get items with valid product_id (matched and accepted)
    const { data: items } = await supabase
      .from('draft_purchase_items')
      .select('*')
      .eq('draft_purchase_id', id)
      .not('product_id', 'is', null)

    const validItems = (items ?? []).filter(i => i.match_status !== 'UNMATCHED')

    if (validItems.length === 0) {
      return NextResponse.json({ error: 'No matched items to confirm' }, { status: 400 })
    }

    // For each item, create batch (if batch_number present) then RESTOCK movement
    let batchesCreated = 0
    for (const item of validItems) {
      let batchId = null

      if (item.batch_number) {
        const { data: newBatch, error: batchErr } = await supabase
          .from('product_batches')
          .insert({
            product_id:      item.product_id,
            entity_id:       draft.entity_id,
            batch_number:    item.batch_number,
            barcode:         item.batch_barcode  || null,
            expires_at:      item.expires_at     || null,
            manufactured_at: item.manufactured_at || null,
            quantity:        item.quantity,
            unit_cost:       item.unit_price     || null,
            mrp:             item.mrp            || null,
            selling_price:   item.selling_price  || null,
            status:          'ACTIVE',
            notes:           `From bill scan — ${draft.supplier_name || 'Unknown supplier'}`,
          })
          .select('id')
          .single()

        if (!batchErr && newBatch) {
          batchId = newBatch.id
          batchesCreated++

          // Update product prices if provided
          if (item.mrp || item.selling_price) {
            const priceUpdate = {}
            if (item.mrp)           priceUpdate.mrp           = parseFloat(item.mrp)
            if (item.selling_price) priceUpdate.selling_price = parseFloat(item.selling_price)
            if (item.unit_price)    priceUpdate.wholesale_price = parseFloat(item.unit_price)
            await supabase.from('products').update(priceUpdate).eq('id', item.product_id)
          }
        }
      }

      // Insert RESTOCK movement — triggers update products.current_stock and batch.quantity
      await supabase.from('inventory_movements').insert({
        product_id:    item.product_id,
        entity_id:     draft.entity_id,
        movement_type: 'RESTOCK',
        quantity:      item.quantity,
        reference_id:  id,
        batch_id:      batchId,
        notes:         `Bill scan: ${draft.supplier_name || 'Unknown supplier'}`,
      })
    }

    // Mark draft as confirmed
    await supabase
      .from('draft_purchases')
      .update({
        status:       'CONFIRMED',
        confirmed_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, itemsRestocked: validItems.length, batchesCreated })
  }

  return NextResponse.json({ error: 'Unknown action. Use confirm or cancel.' }, { status: 400 })
}
