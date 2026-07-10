import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Detail for one Sales Order / Quotation: its lines with how much of each is already invoiced and how
// much remains, so the console can drive partial fulfilment.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

/** GET /api/console/sales/[id] — sales order + lines with { invoiced, remaining }. */
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
      .select('id, order_no, status, is_quotation, subtotal, gst_total, grand_total, payment_method, created_at, buyer_id, seller_id')
      .eq('id', id).eq('order_type', 'SALES_ORDER').maybeSingle()
    if (error || !order) return NextResponse.json({ error: 'Sales order not found' }, { status: 404 })
    if (order.seller_id !== entityId) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: lines } = await supabase
      .from('order_items')
      .select('id, product_id, package_id, name, sku, quantity, unit_price, gst_5, total')
      .eq('order_id', id).eq('status', 'ACTIVE').order('created_at')

    // Already-invoiced per line, across non-cancelled SALES_INVOICE children.
    const { data: children } = await supabase
      .from('orders').select('id').eq('sales_order_id', id).eq('order_type', 'SALES_INVOICE').neq('status', 'CANCELLED')
    const childIds = (children ?? []).map(c => c.id)
    const invoiced = {}
    if (childIds.length) {
      const { data: rows } = await supabase
        .from('order_items').select('product_id, package_id, quantity').in('order_id', childIds).eq('status', 'ACTIVE')
      for (const r of rows ?? []) {
        const k = `${r.product_id}:${r.package_id || ''}`
        invoiced[k] = (invoiced[k] || 0) + r.quantity
      }
    }

    const detailedLines = (lines ?? []).map(l => {
      const inv = invoiced[`${l.product_id}:${l.package_id || ''}`] || 0
      return { ...l, invoiced: inv, remaining: Math.max(0, l.quantity - inv) }
    })

    return NextResponse.json({ order, lines: detailedLines })
  } catch (err) {
    console.error('[console/sales/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
