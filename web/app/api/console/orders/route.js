import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { createB2BOrder } from '@/lib/console/b2b-order'

// Orders for the distributor / wholesaler consoles.
//
//   GET  — incoming orders where I am the seller (sales TO my buyers). Read-only list for both
//          consoles, scoped to ctx.entityId, OWNER/MANAGER gated. Acted on via /orders/[id].
//   POST — buyer restock: a wholesaler orders from a linked distributor's catalog. Delegates to the
//          shared B2B order engine (createB2BOrder) with seller = the distributor, buyer = me. The
//          seller-initiated mirror (I sell to a downstream buyer) lives at /api/console/sales.

/** GET /api/console/orders — incoming orders where this entity is the seller. */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, subtotal, gst_total, grand_total, payment_method, created_at, buyer_id, seller_id, items')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data: orders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with the buyer's business name (the counter-party on an incoming order).
    if (orders?.length) {
      const buyerIds = [...new Set(orders.map(o => o.buyer_id).filter(Boolean))]
      if (buyerIds.length) {
        const { data: entities } = await supabase
          .from('entities')
          .select('id, name')
          .in('id', buyerIds)
        const nameById = Object.fromEntries((entities || []).map(e => [e.id, e.name]))
        orders.forEach(o => { o.buyer_name = nameById[o.buyer_id] || 'Unknown' })
      } else {
        orders.forEach(o => { o.buyer_name = o.buyer_id ? 'Unknown' : 'Walk-in' })
      }
    }

    return NextResponse.json({ orders: orders ?? [] })
  } catch (err) {
    console.error('[console/orders] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/orders — wholesaler places a restock order with a linked distributor. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, role, userId, supabase } = ctx
    if (role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers can order from distributors' }, { status: 403 })
    }

    const { supplier_id, items } = await request.json()
    if (!supplier_id) return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 })

    // Buyer-initiated: seller = the distributor I'm ordering from, buyer = me. Always on credit.
    const result = await createB2BOrder({
      supabase, sellerId: supplier_id, buyerId: entityId, items, userId, paymentMethod: 'CREDIT',
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, order: result.order }, { status: result.status })
    }
    return NextResponse.json(
      result.warning ? { order: result.order, warning: result.warning } : { order: result.order },
      { status: 201 },
    )
  } catch (err) {
    console.error('[console/orders] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
