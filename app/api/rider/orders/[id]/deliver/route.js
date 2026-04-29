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
    const { otp } = await request.json()

    if (!otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: '6-digit OTP is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data: rider } = await serviceClient
      .from('riders')
      .select('id, name')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_no, status, delivery_otp, delivery_otp_expires_at, buyer_whatsapp, payment_token, grand_total, rider_id, entities!seller_id(name)')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id !== rider.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (order.status !== 'DISPATCHED') {
      return NextResponse.json({ error: `Order is not dispatched (status: ${order.status})` }, { status: 400 })
    }
    if (!order.delivery_otp) {
      return NextResponse.json({ error: 'No delivery OTP set for this order' }, { status: 400 })
    }
    if (new Date() > new Date(order.delivery_otp_expires_at)) {
      return NextResponse.json({ error: 'Delivery OTP has expired. Ask customer to request a new one.' }, { status: 400 })
    }
    if (order.delivery_otp !== otp) {
      return NextResponse.json({ error: 'Incorrect OTP. Please check with the customer.' }, { status: 400 })
    }

    // Mark DELIVERED
    await serviceClient
      .from('orders')
      .update({
        status: 'DELIVERED',
        delivery_otp: null,
        delivery_otp_expires_at: null,
      })
      .eq('id', orderId)

    // Free up rider
    await serviceClient
      .from('riders')
      .update({ is_available: true, current_order_id: null })
      .eq('id', rider.id)

    // Send payment link to customer
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (order.buyer_whatsapp && order.payment_token) {
      const paymentUrl = `${appUrl}/pay/${orderId}?token=${order.payment_token}`
      fetch(`${gatewayUrl}/api/send-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: order.buyer_whatsapp,
          orderNo: order.order_no,
          grandTotal: order.grand_total,
          paymentUrl,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[rider/orders/deliver]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
