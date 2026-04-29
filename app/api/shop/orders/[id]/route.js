import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

const VENDOR_TRANSITIONS = {
  CONFIRMED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CANCELLED'],
  // Fallback only — when Toofan not yet integrated:
  DISPATCHED: ['DELIVERED'],
  DELIVERED:  ['COMPLETED'],
}

async function getSession(cookieStore) {
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
  const { data: { session }, error } = await supabase.auth.getSession()
  return error ? null : session
}

// GET — customer views their own order detail, OR vendor views their own order
export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies()
    const session = await getSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const serviceClient = createServiceClient()

    const { data: order, error } = await serviceClient
      .from('orders')
      .select(`
        id, order_no, order_type, order_source, status, grand_total, gst_total, subtotal,
        payment_method, delivery_address, delivery_lat, delivery_lng,
        buyer_whatsapp, created_at, updated_at, completed_at, cancelled_at,
        seller_id, buyer_id,
        seller:entities!seller_id(id, name, tpn_gstin, whatsapp_no)
      `)
      .eq('id', id)
      .eq('order_type', 'MARKETPLACE')
      .single()

    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const customerPhone = session.user.user_metadata?.phone
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    const isCustomer = customerPhone && order.buyer_whatsapp === customerPhone
    const isVendor = profile?.entity_id && order.seller_id === profile.entity_id

    if (!isCustomer && !isVendor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch items and timeline in parallel
    const [{ data: items }, { data: timeline }] = await Promise.all([
      serviceClient.from('order_items').select('*').eq('order_id', id).order('id'),
      serviceClient.from('order_status_log').select('*').eq('order_id', id).order('created_at'),
    ])

    // Only return payment_token to the customer (and only when DELIVERED)
    const paymentToken = (isCustomer && order.status === 'DELIVERED')
      ? order.payment_token
      : undefined

    return NextResponse.json({
      order: { ...order, payment_token: undefined },
      items: items || [],
      timeline: timeline || [],
      ...(paymentToken ? { payment_token: paymentToken } : {}),
    })

  } catch (error) {
    console.error('[shop/orders/[id] GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH — vendor updates order status
export async function PATCH(request, { params }) {
  try {
    const cookieStore = await cookies()
    const session = await getSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { status: newStatus, reason } = body

    if (!newStatus) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    const serviceClient = createServiceClient()

    // Resolve vendor's entity
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })

    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('id, order_no, status, seller_id, buyer_whatsapp, payment_token, grand_total, delivery_address, delivery_lat, delivery_lng')
      .eq('id', id)
      .eq('order_type', 'MARKETPLACE')
      .single()

    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== profile.entity_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const allowed = VENDOR_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${order.status} to ${newStatus}` },
        { status: 400 }
      )
    }

    const updateData = { status: newStatus }
    if (newStatus === 'CANCELLED') updateData.cancelled_at = new Date().toISOString()
    if (newStatus === 'COMPLETED') updateData.completed_at = new Date().toISOString()

    const { error: updateError } = await serviceClient
      .from('orders')
      .update(updateData)
      .eq('id', id)

    if (updateError) throw updateError

    // Log status change manually (DB trigger handles it, but log reason if provided)
    if (reason) {
      await serviceClient.from('order_status_log').insert({
        order_id: id,
        from_status: order.status,
        to_status: newStatus,
        actor_id: session.user.id,
        reason,
      }).catch(() => {})
    }

    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // On PROCESSING: dispatch rider via logistics-bridge
    if (newStatus === 'PROCESSING') {
      fetch(`${process.env.LOGISTICS_BRIDGE_URL || 'http://localhost:3002'}/api/dispatch-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: id,
          deliveryProvider: 'toofan',
          customerLocation: {
            address: order.delivery_address,
            lat: order.delivery_lat,
            lng: order.delivery_lng,
          },
          orderDetails: { orderNo: order.order_no, grandTotal: order.grand_total },
        }),
      }).catch(() => {})
    }

    // On DELIVERED (vendor fallback): send payment link to customer
    if (newStatus === 'DELIVERED' && order.payment_token && order.buyer_whatsapp) {
      const paymentUrl = `${appUrl}/pay/${id}?token=${order.payment_token}`
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

    return NextResponse.json({ success: true, status: newStatus })

  } catch (error) {
    console.error('[shop/orders/[id] PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
