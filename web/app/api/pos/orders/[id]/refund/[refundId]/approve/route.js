import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/orders/[id]/refund/[refundId]/approve — approve a refund */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, supabase } = ctx
    const { id, refundId } = await params

    const { error } = await supabase
      .from('refunds')
      .update({ status: 'APPROVED', approved_by: userId })
      .eq('id', refundId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('orders').update({ status: 'REFUND_APPROVED' }).eq('id', id)

    // Mark order_item as REFUNDED — triggers stock restoration
    const { data: refund } = await supabase.from('refunds').select('order_item_id').eq('id', refundId).single()
    if (refund?.order_item_id) {
      await supabase.from('order_items').update({ status: 'REFUNDED' }).eq('id', refund.order_item_id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pos/orders/[id]/refund/[refundId]/approve] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
