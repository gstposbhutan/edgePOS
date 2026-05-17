import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const { delivery_fee } = await request.json()

    if (!delivery_fee || isNaN(parseFloat(delivery_fee)) || parseFloat(delivery_fee) <= 0) {
      return NextResponse.json({ error: 'Valid delivery fee is required' }, { status: 400 })
    }

    const { supabase, userId } = ctx

    const { data: rider } = await supabase
      .from('riders')
      .select('id')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await supabase
      .from('orders')
      .select('id, status, rider_id')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id !== rider.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (order.status !== 'DELIVERED') {
      return NextResponse.json({ error: 'Delivery fee can only be set after delivery' }, { status: 400 })
    }

    await supabase
      .from('orders')
      .update({ delivery_fee: parseFloat(delivery_fee).toFixed(2) })
      .eq('id', orderId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[rider/orders/fee]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
