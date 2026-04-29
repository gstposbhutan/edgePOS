import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

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
      .select('id, name, whatsapp_no')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_no, status, pickup_otp, pickup_otp_expires_at, buyer_whatsapp, rider_id')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id !== rider.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (order.status !== 'PROCESSING' && order.status !== 'CONFIRMED') {
      return NextResponse.json({ error: `Order is not ready for pickup (status: ${order.status})` }, { status: 400 })
    }
    if (!order.pickup_otp) {
      return NextResponse.json({ error: 'No pickup OTP set for this order' }, { status: 400 })
    }
    if (new Date() > new Date(order.pickup_otp_expires_at)) {
      return NextResponse.json({ error: 'Pickup OTP has expired. Ask vendor to regenerate.' }, { status: 400 })
    }
    if (order.pickup_otp !== otp) {
      return NextResponse.json({ error: 'Incorrect OTP. Please check with the vendor.' }, { status: 400 })
    }

    // Generate delivery OTP
    const deliveryOtp = generateOtp()
    const deliveryOtpExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

    await serviceClient
      .from('orders')
      .update({
        status: 'DISPATCHED',
        pickup_otp: null,
        pickup_otp_expires_at: null,
        delivery_otp: deliveryOtp,
        delivery_otp_expires_at: deliveryOtpExpiresAt,
      })
      .eq('id', orderId)

    // Send delivery OTP to customer
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    if (order.buyer_whatsapp) {
      fetch(`${gatewayUrl}/api/send-delivery-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: order.buyer_whatsapp,
          orderNo: order.order_no,
          deliveryOtp,
          riderName: rider.name,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[rider/orders/pickup]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
