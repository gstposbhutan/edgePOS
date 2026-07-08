import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'

export async function POST(request, { params }) {
  try {
    const ctx = await getRiderContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const { otp } = await request.json()

    if (!otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: '6-digit OTP is required' }, { status: 400 })
    }

    const { supabase, userId } = ctx

    const { data: rider } = await supabase
      .from('riders')
      .select('id, name')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await supabase
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
    await supabase
      .from('orders')
      .update({
        status: 'DELIVERED',
        delivery_otp: null,
        delivery_otp_expires_at: null,
      })
      .eq('id', orderId)

    // Rider stays on shift and keeps working the rest of their queue — delivering one order no
    // longer flips availability (queue model).

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
