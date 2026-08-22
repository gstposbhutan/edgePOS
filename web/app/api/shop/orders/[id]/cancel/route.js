import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { notifyEntity } from '@/lib/email/notify'

// POST /api/shop/orders/[id]/cancel — the CUSTOMER cancels their own marketplace order while it's
// still pre-dispatch (CONFIRMED/PROCESSING). Primary use: an order that couldn't reach a rider
// (dispatch_state = UNDELIVERABLE). Once a rider has picked it up (DISPATCHED+) it can't be self-cancelled.
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { supabase, userId } = ctx

    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    const customerPhone = user?.user_metadata?.phone
    if (!customerPhone) return NextResponse.json({ error: 'Customer phone not found' }, { status: 400 })

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, status, buyer_whatsapp, seller_id')
      .eq('id', id)
      .eq('order_type', 'MARKETPLACE')
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.buyer_whatsapp !== customerPhone) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (order.status === 'CANCELLED') return NextResponse.json({ success: true, status: 'CANCELLED' })
    if (!['CONFIRMED', 'PROCESSING'].includes(order.status)) {
      return NextResponse.json(
        { error: 'This order can no longer be cancelled — it is already on its way. Please contact the store.' },
        { status: 400 },
      )
    }

    let reason = 'Cancelled by customer'
    try { const b = await request.json(); if (b?.reason?.trim()) reason = b.reason.trim() } catch { /* no body */ }

    // Cancel. DB triggers restore stock / khata; the status-log trigger records the change.
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        rider_id: null,
        dispatch_state: null,
      })
      .eq('id', id)
      .eq('buyer_whatsapp', customerPhone)
    if (error) throw error

    // Let the vendor know.
    if (order.seller_id) {
      await notifyEntity(supabase, order.seller_id, {
        type: 'ORDER',
        title: `Order ${order.order_no} cancelled by customer`,
        body: `The customer cancelled order ${order.order_no}. Reason: ${reason}`,
        link: `/pos/orders/${order.id}`,
      })
    }

    return NextResponse.json({ success: true, status: 'CANCELLED' })
  } catch (error) {
    console.error('[shop/orders/cancel]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
