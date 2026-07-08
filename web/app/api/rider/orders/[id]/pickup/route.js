import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'
import { generateOtp } from '@/lib/riders/dispatch'
import { sendEmail, entityContactEmail } from '@/lib/email/notify'

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
      .select('id, name, whatsapp_no')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, status, pickup_otp, pickup_otp_expires_at, buyer_whatsapp, buyer_id, rider_id')
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

    await supabase
      .from('orders')
      .update({
        status: 'DISPATCHED',
        pickup_otp: null,
        pickup_otp_expires_at: null,
        delivery_otp: deliveryOtp,
        delivery_otp_expires_at: deliveryOtpExpiresAt,
      })
      .eq('id', orderId)

    // Deliver the delivery code to the customer on every channel: WhatsApp (parked), an in-app
    // notification (always — visible even with a placeholder email), and email (real inboxes).
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
    if (order.buyer_id) {
      ;(async () => {
        await supabase.from('notifications').insert({
          entity_id: order.buyer_id,
          type: 'ORDER',
          title: `Delivery code for ${order.order_no}: ${deliveryOtp}`,
          body: `${rider.name} is on the way with order ${order.order_no}. Give them this code at your door: ${deliveryOtp}`,
          link: `/shop/orders/${order.id}`,
        })
        const customerEmail = await entityContactEmail(supabase, order.buyer_id)
        if (customerEmail) await sendEmail(
          customerEmail,
          `Your delivery code for order ${order.order_no}`,
          `${rider.name} is on the way with order ${order.order_no}.\nDelivery code: ${deliveryOtp}\n\nIt also appears on your order page.`,
        )
      })().catch(() => {})
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[rider/orders/pickup]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
