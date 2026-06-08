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
    const { data: refund } = await supabase.from('refunds').select('order_item_id, amount').eq('id', refundId).single()
    if (refund?.order_item_id) {
      await supabase.from('order_items').update({ status: 'REFUNDED' }).eq('id', refund.order_item_id)
    }

    // P2-3 parity: a refunded credit sale is no longer owed — reverse the khata credit
    // by the refunded amount (matching the terminal, which already reverses on refund).
    const { data: order } = await supabase.from('orders').select('payment_method').eq('id', id).single()
    if (order?.payment_method === 'CREDIT' && refund?.amount) {
      const { error: revErr } = await supabase.rpc('reverse_khata_on_refund', {
        p_order_id: id,
        p_amount: refund.amount,
        p_created_by: userId,
        p_notes: `Refund ${refundId}`,
      })
      if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pos/orders/[id]/refund/[refundId]/approve] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
