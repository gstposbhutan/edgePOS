import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const STATUS_GROUPS = {
  ALL:       null,
  ACTIVE:    ['PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED'],
  COMPLETED: ['COMPLETED', 'DELIVERED'],
  CANCELLED: ['CANCELLED', 'PAYMENT_FAILED'],
  REFUNDS:   ['REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_REJECTED'],
}

/** GET /api/pos/orders/list — fetch orders for the current entity */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'ALL'

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, order_source, status, grand_total, gst_total, payment_method, buyer_whatsapp, buyer_phone, created_at, updated_at')
      .eq('seller_id', entityId)
      .in('order_type', ['POS_SALE', 'WHOLESALE'])
      .order('created_at', { ascending: false })
      .limit(100)

    const filterVal = STATUS_GROUPS[filter]
    if (filterVal) {
      query = query.in('status', filterVal)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ orders: data ?? [] })
  } catch (err) {
    console.error('[pos/orders/list] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
