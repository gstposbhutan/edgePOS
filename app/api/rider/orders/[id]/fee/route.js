import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const { delivery_fee } = await request.json()

    if (!delivery_fee || isNaN(parseFloat(delivery_fee)) || parseFloat(delivery_fee) <= 0) {
      return NextResponse.json({ error: 'Valid delivery fee is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data: rider } = await serviceClient
      .from('riders')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, status, rider_id')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id !== rider.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (order.status !== 'DELIVERED') {
      return NextResponse.json({ error: 'Delivery fee can only be set after delivery' }, { status: 400 })
    }

    await serviceClient
      .from('orders')
      .update({ delivery_fee: parseFloat(delivery_fee).toFixed(2) })
      .eq('id', orderId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[rider/orders/fee]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
