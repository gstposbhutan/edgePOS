import { NextResponse } from 'next/server'
import { resolveTerminal } from '@/lib/sync/terminal-auth'

/**
 * POST /api/sync/wholesale-orders/[id] — a BACK_OFFICE terminal advances/cancels one of its incoming
 * B2B orders. Body: { status } (the target) — the same state machine as the web console
 * (/api/console/orders/[id]). Auth: per-terminal Bearer token; the order must belong to the token's
 * entity (seller). The DB triggers do the seller-stock + khata side-effects; on CANCELLED we also
 * reverse the buyer's receive-on-buy, exactly like the console route.
 */
const VALID = {
  CONFIRMED:  ['PROCESSING', 'DISPATCHED', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED:  ['COMPLETED'],
}

export async function POST(request, { params }) {
  const t = await resolveTerminal(request)
  if (t.error) return NextResponse.json({ error: t.error }, { status: t.status })
  const { supabase, entityId } = t

  const { id } = await params
  const { status: newStatus, reason } = await request.json().catch(() => ({}))
  if (!newStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, seller_id, buyer_id, order_no')
    .eq('id', id).eq('order_type', 'WHOLESALE').maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.seller_id !== entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(VALID[order.status] || []).includes(newStatus)) {
    return NextResponse.json({ error: `Cannot go from ${order.status} to ${newStatus}` }, { status: 400 })
  }

  const updates = { status: newStatus }
  if (newStatus === 'CANCELLED') { updates.cancelled_at = new Date().toISOString(); updates.cancellation_reason = reason || null }
  if (newStatus === 'COMPLETED') updates.completed_at = new Date().toISOString()

  const { error: updErr } = await supabase.from('orders').update(updates).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // On cancel, reverse the buyer's receive-on-buy (no trigger does this) — same as the console route.
  if (newStatus === 'CANCELLED' && order.buyer_id) {
    const { data: received } = await supabase
      .from('inventory_movements')
      .select('product_id, quantity, package_id, package_qty')
      .eq('reference_id', id).eq('entity_id', order.buyer_id).eq('movement_type', 'RESTOCK')
    for (const mv of received ?? []) {
      const { data: prior } = await supabase
        .from('inventory_movements').select('id')
        .eq('reference_id', id).eq('entity_id', order.buyer_id).eq('product_id', mv.product_id).eq('movement_type', 'RETURN').limit(1)
      if (prior?.length) continue
      await supabase.from('inventory_movements').insert({
        product_id: mv.product_id, entity_id: order.buyer_id, movement_type: 'RETURN',
        quantity: -Math.abs(mv.quantity), reference_id: id,
        package_id: mv.package_id || null, package_qty: mv.package_qty ? -Math.abs(mv.package_qty) : null,
        notes: `Reversed — cancelled order ${order.order_no}`,
      })
    }
  }

  await supabase.from('order_status_log').insert({
    order_id: id, from_status: order.status, to_status: newStatus, actor_role: 'TERMINAL', reason: reason || null,
  })

  return NextResponse.json({ success: true, status: newStatus })
}
