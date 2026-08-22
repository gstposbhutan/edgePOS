import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/lib/riders/dispatch'

// Returns the rider's whole QUEUE (all active orders — worked in any sequence), plus recent history
// and the rider's shift/location state.
export async function GET() {
  try {
    const ctx = await getRiderContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, userId } = ctx

    const { data: rider } = await supabase
      .from('riders')
      .select('id, name, is_available, last_lat, last_lng, location_updated_at')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    // Active queue — every in-flight order assigned to this rider.
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, order_no, status, grand_total, delivery_address, delivery_lat, delivery_lng,
        pickup_otp, delivery_otp, delivery_fee, delivery_fee_paid, assigned_at,
        seller:entities!seller_id(id, name, whatsapp_no, address, lat, lng),
        buyer_whatsapp
      `)
      .eq('rider_id', rider.id)
      .in('status', ACTIVE_STATUSES)
      .order('assigned_at', { ascending: true, nullsFirst: true })

    // Attach items for all queued orders in one query.
    let queue = orders || []
    if (queue.length) {
      const ids = queue.map((o) => o.id)
      const { data: items } = await supabase
        .from('order_items').select('order_id, name, quantity').in('order_id', ids)
      const byOrder = new Map(ids.map((id) => [id, []]))
      for (const it of items || []) (byOrder.get(it.order_id) || []).push(it)
      queue = queue.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }))
    }

    // Delivery history (last 20).
    const { data: history } = await supabase
      .from('orders')
      .select('id, order_no, status, grand_total, delivery_address, delivery_fee, created_at, completed_at, updated_at')
      .eq('rider_id', rider.id)
      .in('status', ['DELIVERED', 'COMPLETED'])
      .order('updated_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      queue,
      history: history || [],
      rider: {
        id: rider.id,
        name: rider.name,
        is_available: rider.is_available,
        last_lat: rider.last_lat,
        last_lng: rider.last_lng,
        location_updated_at: rider.location_updated_at,
      },
    })

  } catch (error) {
    console.error('[rider/orders GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
