import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Refund a delivered/completed B2B order (seller-side, vendor consoles). Full or line-level partial:
// pass item_ids to refund only those lines, or omit for the whole order. For each refunded line we
// record the refund, return the seller's stock (order_items → REFUNDED fires
// restore_stock_on_item_refund), pull that line's goods back out of the buyer's inventory, and reverse
// the buyer's khata by the refunded amount (credit sales). The order goes to REFUNDED only once no
// active lines remain.
//
// Distinct from cancel: cancel undoes an order BEFORE fulfilment (CONFIRMED/PROCESSING); refund undoes
// one AFTER it shipped (DISPATCHED/DELIVERED/COMPLETED).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const REFUNDABLE = ['DISPATCHED', 'DELIVERED', 'COMPLETED']

/** POST /api/console/orders/[id]/refund { reason?, item_ids? } — full or line-level partial refund. */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, role, userId, supabase } = ctx
    const { reason, item_ids } = await request.json().catch(() => ({}))

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, seller_id, buyer_id, order_no, payment_method')
      .eq('id', id)
      .eq('order_type', 'WHOLESALE')
      .single()
    if (fetchErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== entityId) return NextResponse.json({ error: 'Not your order to refund' }, { status: 403 })
    if (!REFUNDABLE.includes(order.status)) {
      return NextResponse.json({ error: `Cannot refund an order that is ${order.status} (cancel it instead if not yet shipped)` }, { status: 409 })
    }

    // Resolve which ACTIVE lines to refund: the requested subset, or all of them (full refund).
    const { data: activeLines, error: liErr } = await supabase
      .from('order_items')
      .select('id, product_id, quantity, gst_5, total')
      .eq('order_id', id).eq('status', 'ACTIVE')
    if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 })
    if (!activeLines?.length) return NextResponse.json({ error: 'Nothing left to refund on this order' }, { status: 409 })

    const wantSet = Array.isArray(item_ids) && item_ids.length ? new Set(item_ids) : null
    const targets = wantSet ? activeLines.filter(l => wantSet.has(l.id)) : activeLines
    if (!targets.length) return NextResponse.json({ error: 'No matching active lines to refund' }, { status: 400 })

    const refundAmount = parseFloat(targets.reduce((s, l) => s + parseFloat(l.total || 0), 0).toFixed(2))
    const gstReversal = parseFloat(targets.reduce((s, l) => s + parseFloat(l.gst_5 || 0), 0).toFixed(2))
    const isFull = targets.length === activeLines.length
    const targetIds = targets.map(l => l.id)

    // 1. Record the refund.
    const { error: refErr } = await supabase.from('refunds').insert({
      order_id: id, refund_type: isFull ? 'FULL' : 'PARTIAL', refund_method: order.payment_method,
      amount: refundAmount, gst_reversal: gstReversal, reason: reason || (isFull ? 'Full refund' : 'Partial refund'),
      requested_by: userId, approved_by: userId, status: 'COMPLETED', processed_at: new Date().toISOString(),
    })
    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

    // 2. Return the seller's stock — marking the target lines REFUNDED fires
    //    restore_stock_on_item_refund (product-level, batch-aware).
    const { error: markErr } = await supabase
      .from('order_items').update({ status: 'REFUNDED' }).in('id', targetIds).eq('status', 'ACTIVE')
    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 })

    // 3. Pull the refunded lines' goods back out of the buyer's inventory (reverse the receive-on-buy
    //    per line: reverse from the buyer's own mirror of the product).
    if (order.buyer_id) {
      const prodIds = [...new Set(targets.map(l => l.product_id).filter(Boolean))]
      let mirrorBySource = {}
      if (prodIds.length) {
        const { data: mirrors } = await supabase
          .from('products').select('id, source_product_id')
          .eq('created_by', order.buyer_id).in('source_product_id', prodIds)
        mirrorBySource = Object.fromEntries((mirrors ?? []).map(m => [m.source_product_id, m.id]))
      }
      for (const l of targets) {
        const mirrorId = mirrorBySource[l.product_id]
        if (!mirrorId) continue
        await supabase.from('inventory_movements').insert({
          product_id: mirrorId, entity_id: order.buyer_id, movement_type: 'RETURN',
          quantity: -Math.abs(l.quantity), reference_id: id,
          notes: `Reversed — refunded order ${order.order_no}`,
        })
      }
    }

    // 4. Reverse the buyer's khata by the refunded amount (credit sales).
    if (order.payment_method === 'CREDIT' && refundAmount > 0) {
      const { error: khataErr } = await supabase.rpc('reverse_khata_on_refund', {
        p_order_id: id, p_amount: refundAmount, p_created_by: userId, p_notes: `Refund ${order.order_no}`,
      })
      if (khataErr) console.error('[console/orders/[id]/refund] khata reversal failed:', khataErr)
    }

    // 5. Move the order to REFUNDED only if nothing active remains; otherwise leave it (partial).
    const newStatus = isFull ? 'REFUNDED' : order.status
    if (isFull) {
      await supabase.from('orders').update({ status: 'REFUNDED' }).eq('id', id)
      await supabase.from('order_status_log').insert({
        order_id: id, from_status: order.status, to_status: 'REFUNDED',
        actor_id: userId, actor_role: role, reason: reason || 'Full refund',
      })
    }

    return NextResponse.json({ success: true, status: newStatus, refunded: isFull ? 'FULL' : 'PARTIAL', amount: refundAmount })
  } catch (err) {
    console.error('[console/orders/[id]/refund] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
