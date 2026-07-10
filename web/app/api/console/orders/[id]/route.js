import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Actions on a single B2B order for the vendor consoles (the seller's fulfilment controls). Parallel
// copy of /api/wholesale/orders/[id], scoped to the console tiers.
//
//   GET   — order detail (items + timeline + counter-party). Visible to the seller or the buyer.
//   PATCH — the seller advances or cancels the order. On CANCEL we let the DB triggers return the
//           seller's stock and reverse the khata, and additionally reverse the receive-on-buy the
//           create engine posted to the BUYER's inventory (no trigger does that for us).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const VALID_TRANSITIONS = {
  CONFIRMED: ['PROCESSING', 'DISPATCHED', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
}

/** GET /api/console/orders/[id] — order detail (seller or buyer). */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const { entityId, supabase } = ctx

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('order_type', 'WHOLESALE')
      .single()
    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== entityId && order.buyer_id !== entityId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const [{ data: items }, { data: timeline }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_status_log').select('*').eq('order_id', id).order('created_at'),
    ])
    const counterId = order.seller_id === entityId ? order.buyer_id : order.seller_id
    const { data: counter } = counterId
      ? await supabase.from('entities').select('id, name, whatsapp_no, address').eq('id', counterId).maybeSingle()
      : { data: null }

    return NextResponse.json({ order, items: items || [], timeline: timeline || [], counter_party: counter || null })
  } catch (err) {
    console.error('[console/orders/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/console/orders/[id] { status, reason? } — the seller advances/cancels the order. */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!VENDOR_ROLES.includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { entityId, role, userId, supabase } = ctx
    const { status: newStatus, reason } = await request.json().catch(() => ({}))
    if (!newStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 })

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, seller_id, buyer_id, order_no, payment_method')
      .eq('id', id)
      .eq('order_type', 'WHOLESALE')
      .single()
    if (fetchErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== entityId) return NextResponse.json({ error: 'Not your order to fulfil' }, { status: 403 })

    const allowed = VALID_TRANSITIONS[order.status] || []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot go from ${order.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}` },
        { status: 400 },
      )
    }

    const updates = { status: newStatus }
    if (newStatus === 'CANCELLED') { updates.cancelled_at = new Date().toISOString(); updates.cancellation_reason = reason || null }
    if (newStatus === 'COMPLETED') updates.completed_at = new Date().toISOString()

    // On cancel, pre-cancel the lines FIRST so the seller's stock is restored exactly once. Both an
    // order-level trigger (restore_stock_on_cancel) and an item-level trigger
    // (restore_stock_on_item_cancel) return stock, and a plain order flip fires both → double
    // restore. Cancelling the lines first fires only the item-level restore (once); the order flip
    // below then finds no ACTIVE lines, so the order-level trigger is a stock no-op. The khata
    // reversal still fires on the order flip (it keys off the DEBIT txn, not the lines).
    if (newStatus === 'CANCELLED') {
      const { error: lineErr } = await supabase
        .from('order_items')
        .update({ status: 'CANCELLED' })
        .eq('order_id', id).eq('status', 'ACTIVE')
      if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 })
    }

    // The order flip fires khata_credit_on_cancel (reverses the buyer's khata debit).
    const { error: updateErr } = await supabase.from('orders').update(updates).eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Reverse the buyer's receive-on-buy: the create engine posted RESTOCK movements into the buyer's
    // own stock at confirm; on cancel those goods go back. No trigger does this, so we negate each of
    // the buyer's RESTOCK movements for this order (idempotent — skip products already reversed).
    if (newStatus === 'CANCELLED' && order.buyer_id) {
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
          notes: `Reversed — cancelled order ${order.order_no}`,
        })
      }
    }

    // Log with actor info (mirrors the wholesale route; the orders_status_log trigger also records it).
    await supabase.from('order_status_log').insert({
      order_id: id, from_status: order.status, to_status: newStatus,
      actor_id: userId, actor_role: role, reason: reason || null,
    })

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err) {
    console.error('[console/orders/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
