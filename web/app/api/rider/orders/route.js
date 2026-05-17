import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, userId } = ctx

    // Resolve rider record from auth user
    const { data: rider } = await supabase
      .from('riders')
      .select('id, name, current_order_id')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    // Current assigned order
    let current = null
    if (rider.current_order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select(`
          id, order_no, status, grand_total, delivery_address, delivery_lat, delivery_lng,
          pickup_otp, delivery_otp, delivery_fee, delivery_fee_paid,
          seller:entities!seller_id(id, name, whatsapp_no, address),
          buyer_whatsapp
        `)
        .eq('id', rider.current_order_id)
        .single()

      if (order) {
        const { data: items } = await supabase
          .from('order_items')
          .select('id, name, quantity')
          .eq('order_id', order.id)

        current = { ...order, items: items || [] }
      }
    }

    // Delivery history (last 20)
    const { data: history } = await supabase
      .from('orders')
      .select('id, order_no, status, grand_total, delivery_address, created_at, completed_at')
      .eq('rider_id', rider.id)
      .in('status', ['DELIVERED', 'COMPLETED'])
      .order('updated_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ current, history: history || [], rider: { id: rider.id, name: rider.name } })

  } catch (error) {
    console.error('[rider/orders GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
