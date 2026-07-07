import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Order states from which a cancellation is allowed (mirrors the orders_restore_stock_cancel trigger).
const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLATION_REQUESTED']

/**
 * POST /api/pos/orders/[id]/cancel — admin/manager cancels an order, in full or in part.
 *
 * Body: { reason?, items?: [{ id, quantity }] }
 *   - No `items`         → FULL cancel: status → CANCELLED. The orders_restore_stock_cancel trigger
 *                          returns every ACTIVE line's quantity to stock (RETURN movements).
 *   - `items` provided   → PARTIAL cancel: return only the given quantity of each listed line to
 *                          stock, shrink/close those lines, and recompute the order total. If nothing
 *                          active remains, the order itself is moved to CANCELLED.
 *
 * Returning quantities to stock is done by inserting RETURN inventory_movements, which the
 * inventory_movement_apply trigger applies to products.current_stock (and the batch).
 */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, role, supabase } = ctx
    const { id } = await params
    const { reason, actor_id, actor_role, items } = await request.json()

    // Manager/admin only.
    const { data: prof } = await supabase.from('user_profiles').select('sub_role').eq('id', userId).single()
    const isManager = ['OWNER', 'MANAGER'].includes(prof?.sub_role) || ['SUPER_ADMIN', 'ADMIN'].includes(role)
    if (!isManager) return NextResponse.json({ error: 'Only a manager or owner can cancel an order' }, { status: 403 })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_no, status, seller_id, order_type')
      .eq('id', id)
      .single()
    if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (!CANCELLABLE.includes(order.status)) {
      return NextResponse.json({ error: `Cannot cancel an order that is ${order.status}` }, { status: 409 })
    }

    const partial = Array.isArray(items) && items.length > 0

    // ---- FULL cancel: let the trigger restore stock + close all lines. ----
    if (!partial) {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED', cancellation_reason: reason || null, cancelled_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabase.from('order_status_log').insert({
        order_id: id, from_status: order.status, to_status: 'CANCELLED',
        actor_id: actor_id || userId, actor_role: actor_role || role, reason: reason || null,
      })
      return NextResponse.json({ success: true, cancelled: 'FULL' })
    }

    // ---- PARTIAL cancel: return the given quantities, shrink/close those lines. ----
    const { data: lines, error: liErr } = await supabase
      .from('order_items')
      .select('id, product_id, batch_id, quantity, unit_price, status')
      .eq('order_id', id)
    if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 })

    const byId = Object.fromEntries((lines || []).map(l => [l.id, l]))
    const restored = []

    for (const req of items) {
      const line = byId[req.id]
      if (!line || line.status !== 'ACTIVE') continue
      const cancelQty = Math.min(Math.max(0, parseInt(req.quantity, 10) || 0), line.quantity)
      if (cancelQty <= 0) continue

      // Return the cancelled quantity to stock (trigger updates current_stock + batch).
      if (line.product_id) {
        await supabase.from('inventory_movements').insert({
          product_id:    line.product_id,
          entity_id:     order.seller_id,
          movement_type: 'RETURN',
          quantity:      cancelQty,
          reference_id:  order.id,
          batch_id:      line.batch_id ?? null,
          notes:         `Partial cancellation on ${order.order_no}`,
        })
      }

      const remaining = line.quantity - cancelQty
      if (remaining <= 0) {
        await supabase.from('order_items').update({ status: 'CANCELLED' }).eq('id', line.id)
      } else {
        const taxable = parseFloat(line.unit_price) * remaining
        await supabase.from('order_items').update({
          quantity: remaining,
          gst_5:    parseFloat((taxable * 0.05).toFixed(2)),
          total:    parseFloat((taxable * 1.05).toFixed(2)),
        }).eq('id', line.id)
      }
      restored.push({ id: line.id, quantity: cancelQty })
    }

    if (!restored.length) {
      return NextResponse.json({ error: 'No matching active line items to cancel' }, { status: 400 })
    }

    // Recompute order totals from the lines that are still active.
    const { data: fresh } = await supabase
      .from('order_items')
      .select('quantity, unit_price, status')
      .eq('order_id', id)
    const active = (fresh || []).filter(l => l.status === 'ACTIVE')
    const subtotal = active.reduce((s, l) => s + parseFloat(l.unit_price) * l.quantity, 0)
    const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
    const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

    const nowAllCancelled = active.length === 0
    await supabase.from('orders').update({
      subtotal,
      gst_total: gstTotal,
      grand_total: grandTotal,
      ...(nowAllCancelled
        ? { status: 'CANCELLED', cancellation_reason: reason || 'All items cancelled', cancelled_at: new Date().toISOString() }
        : {}),
    }).eq('id', id)

    await supabase.from('order_status_log').insert({
      order_id: id,
      from_status: order.status,
      to_status: nowAllCancelled ? 'CANCELLED' : order.status,
      actor_id: actor_id || userId,
      actor_role: actor_role || role,
      reason: reason || `Partial cancellation (${restored.length} line${restored.length === 1 ? '' : 's'})`,
    })

    return NextResponse.json({ success: true, cancelled: nowAllCancelled ? 'FULL' : 'PARTIAL', restored, grand_total: grandTotal })
  } catch (err) {
    console.error('[pos/orders/[id]/cancel] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
