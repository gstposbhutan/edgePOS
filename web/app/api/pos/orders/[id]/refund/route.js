import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/orders/[id]/refund — request a refund for specific items */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = ctx.supabase
    const { refundItems, reason, requestedBy } = await request.json()

    // Fetch order
    const { data: order } = await supabase
      .from('orders')
      .select('payment_method')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Fetch items being refunded
    const { data: items } = await supabase
      .from('order_items')
      .select('id, total, gst_5, quantity')
      .in('id', refundItems.map(i => i.order_item_id))

    if (!items?.length) return NextResponse.json({ error: 'No items found' }, { status: 400 })

    const refundAmount = items.reduce((sum, i) => {
      const refundItem = refundItems.find(ri => ri.order_item_id === i.id)
      const ratio = (refundItem?.quantity ?? i.quantity) / i.quantity
      return sum + parseFloat(i.total) * ratio
    }, 0)

    const gstReversal = items.reduce((sum, i) => {
      const refundItem = refundItems.find(ri => ri.order_item_id === i.id)
      const ratio = (refundItem?.quantity ?? i.quantity) / i.quantity
      return sum + parseFloat(i.gst_5) * ratio
    }, 0)

    const errors = []
    for (const ri of refundItems) {
      const { error } = await supabase.from('refunds').insert({
        order_id: id,
        order_item_id: ri.order_item_id,
        quantity: ri.quantity,
        refund_type: 'PARTIAL',
        refund_method: order.payment_method,
        amount: parseFloat((refundAmount / refundItems.length).toFixed(2)),
        gst_reversal: parseFloat((gstReversal / refundItems.length).toFixed(2)),
        reason,
        requested_by: requestedBy,
        status: 'REQUESTED',
      })
      if (error) errors.push(error.message)
    }

    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 500 })

    await supabase.from('orders').update({ status: 'REFUND_REQUESTED' }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pos/orders/[id]/refund] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
