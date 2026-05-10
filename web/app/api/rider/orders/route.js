import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

async function getRiderSession(cookieStore) {
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
  return session
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = await getRiderSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceClient()

    // Resolve rider record from auth user
    const { data: rider } = await serviceClient
      .from('riders')
      .select('id, name, current_order_id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    // Current assigned order
    let current = null
    if (rider.current_order_id) {
      const { data: order } = await serviceClient
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
        const { data: items } = await serviceClient
          .from('order_items')
          .select('id, name, quantity')
          .eq('order_id', order.id)

        current = { ...order, items: items || [] }
      }
    }

    // Delivery history (last 20)
    const { data: history } = await serviceClient
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
