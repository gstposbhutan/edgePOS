import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { createB2BOrder } from '@/lib/console/b2b-order'

// Seller-initiated B2B selling for the vendor consoles: a distributor sells to a linked wholesaler,
// a wholesaler sells to a linked retailer. The mirror of /api/console/orders (which is buyer-
// initiated). Delegates to the shared engine with seller = me, buyer = the picked downstream account;
// the order confirms immediately (deduct my stock, debit the buyer's khata on CREDIT, receive into
// the buyer's inventory). Outgoing sales appear in the same GET /api/console/orders inbox (seller_id
// = me) and are acted on via /api/console/orders/[id].
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

/** POST /api/console/sales { buyer_id, items:[{product_id, package_id?, quantity}], payment_method? } */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!VENDOR_ROLES.includes(ctx.role)) {
      return NextResponse.json({ error: 'Only distributors and wholesalers can sell to buyers' }, { status: 403 })
    }

    const { entityId, userId, supabase } = ctx
    const { buyer_id, items, payment_method } = await request.json().catch(() => ({}))

    const result = await createB2BOrder({
      supabase, sellerId: entityId, buyerId: buyer_id, items, userId,
      paymentMethod: payment_method || 'CREDIT',
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, order: result.order }, { status: result.status })
    }
    return NextResponse.json(
      result.warning ? { order: result.order, warning: result.warning } : { order: result.order },
      { status: 201 },
    )
  } catch (err) {
    console.error('[console/sales] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
