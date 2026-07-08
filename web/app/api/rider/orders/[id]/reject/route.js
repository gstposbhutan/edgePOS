import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'
import { assignOrderToRider } from '@/lib/riders/dispatch'

// A rider declines an order in their queue. It's recorded so re-dispatch skips them, the assignment
// is cleared, and the order is immediately pushed to the next-best rider. The rider stays on shift.
export async function POST(request, { params }) {
  try {
    const ctx = await getRiderContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const { supabase, userId } = ctx

    const { data: rider } = await supabase
      .from('riders').select('id').eq('auth_user_id', userId).single()
    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await supabase
      .from('orders')
      .select('id, rider_id, status, declined_rider_ids')
      .eq('id', orderId)
      .single()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id !== rider.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (order.status === 'DISPATCHED') {
      // Already picked up — can't hand it off mid-delivery.
      return NextResponse.json({ error: 'Order already picked up — cannot reject' }, { status: 400 })
    }

    const declined = Array.from(new Set([...(order.declined_rider_ids || []), rider.id]))

    // Clear assignment; record the decline. Keep the rider on shift (queue model).
    await supabase
      .from('orders')
      .update({
        rider_id: null,
        rider_accepted_at: null,
        assigned_at: null,
        pickup_otp: null,
        pickup_otp_expires_at: null,
        declined_rider_ids: declined,
      })
      .eq('id', orderId)
      .eq('rider_id', rider.id)

    // Immediately re-dispatch to the next-best rider (the lib excludes anyone in declined_rider_ids).
    const result = await assignOrderToRider(supabase, orderId)

    return NextResponse.json({ success: true, reassigned: result.assigned })

  } catch (error) {
    console.error('[rider/orders/reject]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
