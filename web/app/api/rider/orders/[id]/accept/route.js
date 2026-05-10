import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function getRider(serviceClient, authUserId) {
  const { data } = await serviceClient
    .from('riders')
    .select('id, name, whatsapp_no, is_active, is_available, current_order_id')
    .eq('auth_user_id', authUserId)
    .single()
  return data
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
    const serviceClient = createServiceClient()

    const rider = await getRider(serviceClient, session.user.id)
    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })
    if (!rider.is_active || !rider.is_available) {
      return NextResponse.json({ error: 'You are not available to accept orders' }, { status: 400 })
    }

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_no, status, seller_id, buyer_whatsapp, grand_total, delivery_address, rider_id, entities!seller_id(name, whatsapp_no)')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.rider_id && order.rider_id !== rider.id) {
      return NextResponse.json({ error: 'Order already assigned to another rider' }, { status: 409 })
    }

    const pickupOtp = generateOtp()
    const pickupOtpExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    // Assign rider and set pickup OTP
    await serviceClient
      .from('orders')
      .update({
        rider_id: rider.id,
        rider_accepted_at: new Date().toISOString(),
        pickup_otp: pickupOtp,
        pickup_otp_expires_at: pickupOtpExpiresAt,
      })
      .eq('id', orderId)

    await serviceClient
      .from('riders')
      .update({ is_available: false, current_order_id: orderId })
      .eq('id', rider.id)

    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    const vendorPhone = order.entities?.whatsapp_no

    if (vendorPhone) {
      fetch(`${gatewayUrl}/api/send-pickup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorPhone,
          orderNo: order.order_no,
          riderName: rider.name,
          pickupOtp,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, pickup_otp: pickupOtp })

  } catch (error) {
    console.error('[rider/orders/accept]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
