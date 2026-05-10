import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
    const body = await request.json()
    const { receipt_url } = body

    if (!receipt_url?.trim()) {
      return NextResponse.json({ error: 'Receipt image URL is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor not found' }, { status: 403 })

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, status, seller_id, delivery_fee, rider_id')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== profile.entity_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
      return NextResponse.json({ error: 'Order must be delivered before confirming fee' }, { status: 400 })
    }
    if (!order.delivery_fee) {
      return NextResponse.json({ error: 'No delivery fee set by rider yet' }, { status: 400 })
    }

    await serviceClient
      .from('orders')
      .update({
        delivery_fee_paid:         true,
        delivery_fee_receipt_url:  receipt_url.trim(),
        delivery_fee_confirmed_at: new Date().toISOString(),
        status:                    'COMPLETED',
        completed_at:              new Date().toISOString(),
      })
      .eq('id', orderId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[confirm-delivery-fee]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
