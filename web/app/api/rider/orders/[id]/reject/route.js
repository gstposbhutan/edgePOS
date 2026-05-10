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
    const serviceClient = createServiceClient()

    const { data: rider } = await serviceClient
      .from('riders')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    // Clear rider assignment from this order (so logistics bridge can try next rider)
    await serviceClient
      .from('orders')
      .update({ rider_id: null, pickup_otp: null, pickup_otp_expires_at: null })
      .eq('id', orderId)
      .eq('rider_id', rider.id)

    // Mark rider as available again
    await serviceClient
      .from('riders')
      .update({ is_available: true, current_order_id: null })
      .eq('id', rider.id)

    // Trigger next rider assignment via logistics bridge (fire-and-forget)
    const logisticsUrl = process.env.LOGISTICS_BRIDGE_URL || 'http://localhost:3002'
    fetch(`${logisticsUrl}/api/dispatch-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, deliveryProvider: 'toofan', retry: true }),
    }).catch(() => {})

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[rider/orders/reject]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
