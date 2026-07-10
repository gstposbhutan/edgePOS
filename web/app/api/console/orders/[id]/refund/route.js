import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Refund a delivered/completed B2B order (seller-side, vendor consoles). A full refund in one step:
// record the refund, return the seller's stock (order_items → REFUNDED fires
// restore_stock_on_item_refund), pull the goods back out of the buyer's inventory (reverse the
// receive-on-buy), and reverse the buyer's khata debit for a credit sale.
//
// Distinct from cancel: cancel undoes an order BEFORE fulfilment (CONFIRMED/PROCESSING); refund
// undoes one AFTER it shipped (DISPATCHED/DELIVERED/COMPLETED).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const REFUNDABLE = ['DISPATCHED', 'DELIVERED', 'COMPLETED']

/** POST /api/console/orders/[id]/refund { reason? } — full refund of an incoming order. */
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
    const { reason } = await request.json().catch(() => ({}))

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, seller_id, buyer_id, order_no, payment_method, grand_total, gst_total')
      .eq('id', id)
      .eq('order_type', 'WHOLESALE')
      .single()
    if (fetchErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== entityId) return NextResponse.json({ error: 'Not your order to refund' }, { status: 403 })
    if (!REFUNDABLE.includes(order.status)) {
      return NextResponse.json({ error: `Cannot refund an order that is ${order.status} (cancel it instead if not yet shipped)` }, { status: 409 })
    }

    // 1. Record the refund (one-step: a manager processes it directly).
    const { error: refErr } = await supabase.from('refunds').insert({
      order_id: id,
      refund_type: 'FULL',
      refund_method: order.payment_method,
      amount: order.grand_total,
      gst_reversal: order.gst_total ?? 0,
      reason: reason || 'Full refund',
      requested_by: userId,
      approved_by: userId,
      status: 'COMPLETED',
      processed_at: new Date().toISOString(),
    })
    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

    // 2. Return the seller's stock — marking the lines REFUNDED fires restore_stock_on_item_refund
    //    (product-level, batch-aware).
    const { error: lineErr } = await supabase
      .from('order_items')
      .update({ status: 'REFUNDED' })
      .eq('order_id', id).eq('status', 'ACTIVE')
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 })

    // 3. Pull the goods back out of the buyer's inventory (reverse the receive-on-buy). Idempotent —
    //    skip products already reversed for this order.
    if (order.buyer_id) {
      const { data: received } = await supabase
        .from('inventory_movements')
        .select('product_id, quantity, package_id, package_qty')
        .eq('reference_id', id).eq('entity_id', order.buyer_id).eq('movement_type', 'RESTOCK')
      for (const mv of received ?? []) {
        const { data: prior } = await supabase
          .from('inventory_movements')
          .select('id')
          .eq('reference_id', id).eq('entity_id', order.buyer_id).eq('product_id', mv.product_id).eq('movement_type', 'RETURN')
          .limit(1)
        if (prior?.length) continue
        await supabase.from('inventory_movements').insert({
          product_id: mv.product_id, entity_id: order.buyer_id, movement_type: 'RETURN',
          quantity: -Math.abs(mv.quantity), reference_id: id,
          package_id: mv.package_id || null, package_qty: mv.package_qty ? -Math.abs(mv.package_qty) : null,
          notes: `Reversed — refunded order ${order.order_no}`,
        })
      }
    }

    // 4. Reverse the buyer's khata debit for a credit sale.
    if (order.payment_method === 'CREDIT') {
      const { error: khataErr } = await supabase.rpc('reverse_khata_on_refund', {
        p_order_id: id, p_amount: order.grand_total, p_created_by: userId, p_notes: `Refund ${order.order_no}`,
      })
      if (khataErr) console.error('[console/orders/[id]/refund] khata reversal failed:', khataErr)
    }

    // 5. Move the order to REFUNDED + log.
    const { error: statusErr } = await supabase
      .from('orders')
      .update({ status: 'REFUNDED' })
      .eq('id', id)
    if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

    await supabase.from('order_status_log').insert({
      order_id: id, from_status: order.status, to_status: 'REFUNDED',
      actor_id: userId, actor_role: role, reason: reason || 'Full refund',
    })

    return NextResponse.json({ success: true, status: 'REFUNDED' })
  } catch (err) {
    console.error('[console/orders/[id]/refund] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
