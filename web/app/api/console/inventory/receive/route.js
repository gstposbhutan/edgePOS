import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { ownedWarehouse, ownedProduct } from '@/lib/console/inventory'

// Receive stock into a specific warehouse (vendor consoles). Mirrors the retailer batch-receive path
// but stamps warehouse_id: create the batch with quantity 0, then a RESTOCK movement carrying the
// warehouse — the triggers set the batch quantity, bump warehouse_stock (that warehouse) and
// products.current_stock (the entity total). Optionally refresh the product's prices/cost.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, userId, supabase } = ctx
    const body = await request.json().catch(() => ({}))
    const { product_id, warehouse_id, quantity, unit_cost, mrp, selling_price, batch_number, barcode, manufactured_at, expires_at, notes } = body

    const qty = parseInt(quantity, 10)
    if (!qty || qty < 1) return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })

    const wh = await ownedWarehouse(supabase, entityId, warehouse_id)
    if (!wh) return NextResponse.json({ error: 'Pick a warehouse to receive into' }, { status: 400 })
    const prod = await ownedProduct(supabase, entityId, product_id)
    if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const batchNo = (batch_number || '').trim() || `RCV-${Date.now().toString(36).toUpperCase()}`

    // Create the batch at qty 0; the RESTOCK movement sets the real quantity via sync_batch_quantity.
    const { data: batch, error: batchErr } = await supabase
      .from('product_batches')
      .insert({
        product_id, entity_id: entityId, warehouse_id, batch_number: batchNo,
        barcode: barcode || null, manufactured_at: manufactured_at || null, expires_at: expires_at || null,
        quantity: 0, unit_cost: unit_cost ?? null, mrp: mrp ?? null, selling_price: selling_price ?? null,
        status: 'ACTIVE', notes: notes || null,
      })
      .select('id')
      .single()
    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })

    const { error: mvErr } = await supabase.from('inventory_movements').insert({
      product_id, entity_id: entityId, warehouse_id, movement_type: 'RESTOCK', quantity: qty,
      reference_id: batch.id, batch_id: batch.id, created_by: userId, notes: notes || `Received into ${wh.name}`,
    })
    if (mvErr) {
      await supabase.from('product_batches').delete().eq('id', batch.id)  // compensate
      return NextResponse.json({ error: mvErr.message }, { status: 500 })
    }

    // Refresh product cost/prices if provided (manufacturer/landed cost tracking rides on unit_cost).
    const priceUpd = {}
    if (unit_cost != null) priceUpd.manufacturer_price = unit_cost
    if (mrp != null) priceUpd.mrp = mrp
    if (selling_price != null) priceUpd.selling_price = selling_price
    if (Object.keys(priceUpd).length) {
      await supabase.from('products').update(priceUpd).eq('id', product_id).eq('created_by', entityId)
    }

    return NextResponse.json({ ok: true, batch_id: batch.id }, { status: 201 })
  } catch (err) {
    console.error('[console/inventory/receive] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
