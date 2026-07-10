import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { createB2BOrder, createSalesOrder } from '@/lib/console/b2b-order'

// Seller-initiated B2B selling for the distributor / wholesaler consoles. A distributor sells to a
// linked wholesaler, a wholesaler to a linked retailer.
//
//   POST — create either an immediate sale (mode INVOICE, default: confirmed now, stock + khata +
//          receive) or a priced Sales Order / Quotation (mode SALES_ORDER / QUOTATION: DRAFT, no
//          movement until invoiced via /api/console/sales/[id]/invoice).
//   GET  — list this seller's Sales Orders + Quotations (order_type SALES_ORDER), newest first.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

/** GET /api/console/sales — this seller's Sales Orders + Quotations. */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('orders')
      .select('id, order_no, status, is_quotation, subtotal, gst_total, grand_total, payment_method, created_at, buyer_id, items')
      .eq('seller_id', entityId)
      .eq('order_type', 'SALES_ORDER')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (status) query = query.eq('status', status)

    const { data: orders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (orders?.length) {
      const buyerIds = [...new Set(orders.map(o => o.buyer_id).filter(Boolean))]
      if (buyerIds.length) {
        const { data: entities } = await supabase.from('entities').select('id, name').in('id', buyerIds)
        const nameById = Object.fromEntries((entities || []).map(e => [e.id, e.name]))
        orders.forEach(o => { o.buyer_name = nameById[o.buyer_id] || 'Unknown' })
      }
    }
    return NextResponse.json({ orders: orders ?? [] })
  } catch (err) {
    console.error('[console/sales] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/sales { buyer_id, items[], payment_method?, mode? } — invoice / sales order / quote. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Only distributors and wholesalers can sell to buyers' }, { status: 403 })

    const { entityId, userId, supabase } = ctx
    const { buyer_id, items, payment_method, mode } = await request.json().catch(() => ({}))
    const kind = String(mode || 'INVOICE').toUpperCase()

    if (kind === 'SALES_ORDER' || kind === 'QUOTATION') {
      const result = await createSalesOrder({
        supabase, sellerId: entityId, buyerId: buyer_id, items, userId,
        paymentMethod: payment_method || 'CREDIT', isQuotation: kind === 'QUOTATION',
      })
      if (!result.ok) return NextResponse.json({ error: result.error, order: result.order }, { status: result.status })
      return NextResponse.json({ order: result.order }, { status: 201 })
    }

    // Default: immediate invoice.
    const result = await createB2BOrder({
      supabase, sellerId: entityId, buyerId: buyer_id, items, userId, paymentMethod: payment_method || 'CREDIT',
    })
    if (!result.ok) return NextResponse.json({ error: result.error, order: result.order }, { status: result.status })
    return NextResponse.json(result.warning ? { order: result.order, warning: result.warning } : { order: result.order }, { status: 201 })
  } catch (err) {
    console.error('[console/sales] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
