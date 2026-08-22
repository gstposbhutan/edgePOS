import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/allocate?product=<id>&qty=<n>
 * FEFO/FIFO batch allocation for selling `qty` of a product: walk the product's in-stock ACTIVE
 * batches in rotation order (FEFO = soonest expiry first, else FIFO = oldest received first),
 * consuming from each until qty is met. Read-only — the caller adds the resulting split as
 * per-batch cart lines (each priced at its own batch selling_price → old stock sells at old price).
 * Returns { allocation:[{batch_id,batch_number,quantity,selling_price,unit_cost,expires_at}],
 *           rotation, insufficient, short }.
 */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, entityId } = ctx

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product')
    const qty = Number(searchParams.get('qty') || '0')
    const exclude = searchParams.get('exclude') || null   // batch to skip (already on the line)
    if (!productId || !(qty > 0)) {
      return NextResponse.json({ error: 'product and a positive qty are required' }, { status: 400 })
    }

    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku, unit, stock_rotation, selling_price, mrp, wholesale_price, distributor_price, sold_by_weight, gst_exempt')
      .eq('id', productId)
      .single()
    if (prodErr || !prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    // NONE has no rotation preference → fulfil in received order (like FIFO), just no nudge.
    const rotation = ['FEFO', 'FIFO', 'NONE'].includes(prod.stock_rotation) ? prod.stock_rotation : 'FIFO'

    const { data: batches, error: batchErr } = await supabase
      .from('product_batches')
      .select('id, batch_number, quantity, selling_price, unit_cost, expires_at, received_at')
      .eq('product_id', productId)
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
      .gt('quantity', 0)
    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })

    // Rotation order: FEFO → soonest expiry (nulls last), tiebreak oldest received; FIFO → oldest received.
    const ordered = [...(batches || [])].filter(b => b.id !== exclude).sort((a, b) => {
      if (rotation === 'FEFO') {
        const ae = a.expires_at || '9999-12-31'
        const be = b.expires_at || '9999-12-31'
        if (ae !== be) return ae < be ? -1 : 1
      }
      const ar = a.received_at || ''
      const br = b.received_at || ''
      if (ar !== br) return ar < br ? -1 : 1
      return String(a.id) < String(b.id) ? -1 : 1
    })

    let remaining = qty
    const allocation = []
    for (const b of ordered) {
      if (remaining <= 0) break
      const take = Math.min(Number(b.quantity), remaining)
      if (take <= 0) continue
      allocation.push({
        batch_id: b.id,
        batch_number: b.batch_number,
        quantity: take,
        selling_price: b.selling_price ?? prod.selling_price ?? prod.mrp,
        unit_cost: b.unit_cost ?? null,
        expires_at: b.expires_at ?? null,
      })
      remaining -= take
    }

    return NextResponse.json({
      product: {
        id: prod.id, name: prod.name, sku: prod.sku, unit: prod.unit,
        mrp: prod.mrp, wholesale_price: prod.wholesale_price, distributor_price: prod.distributor_price,
        sold_by_weight: prod.sold_by_weight, gst_exempt: prod.gst_exempt,
      },
      rotation,
      allocation,
      insufficient: remaining > 0,
      short: remaining > 0 ? remaining : 0,
    })
  } catch (err) {
    console.error('[pos/allocate] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
