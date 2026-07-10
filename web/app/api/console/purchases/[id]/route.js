import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Detail for one PO / PI (vendor consoles): the order, its lines, and — for a PO — how much of each
// line has already been received across its invoices, so the client can drive partial receiving.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, supabase } = ctx

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_no, order_type, status, subtotal, grand_total, payment_method, supplier_name, supplier_ref, warehouse_id, purchase_order_id, received_at, created_at, seller_id, buyer_id')
      .eq('id', id).in('order_type', ['PURCHASE_ORDER', 'PURCHASE_INVOICE']).maybeSingle()
    if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (order.buyer_id !== entityId) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: items } = await supabase
      .from('order_items').select('id, product_id, name, sku, quantity, unit_price, unit_cost, total, status, batch_number, expires_at')
      .eq('order_id', id).order('created_at')

    // For a PO, how much of each line is already invoiced (across non-cancelled PI children).
    let received = {}
    if (order.order_type === 'PURCHASE_ORDER') {
      const { data: children } = await supabase
        .from('orders').select('id').eq('purchase_order_id', id).eq('order_type', 'PURCHASE_INVOICE').neq('status', 'CANCELLED')
      const ids = (children ?? []).map(c => c.id)
      if (ids.length) {
        const { data: rows } = await supabase.from('order_items').select('product_id, sku, quantity').in('order_id', ids).eq('status', 'ACTIVE')
        for (const r of rows ?? []) { const k = `${r.product_id}:${r.sku}`; received[k] = (received[k] || 0) + r.quantity }
      }
    }
    const lines = (items || []).map(l => ({ ...l, received: received[`${l.product_id}:${l.sku}`] || 0, remaining: Math.max(0, l.quantity - (received[`${l.product_id}:${l.sku}`] || 0)) }))

    return NextResponse.json({ order, lines })
  } catch (err) {
    console.error('[console/purchases/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
