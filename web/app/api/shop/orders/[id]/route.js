import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { assignOrderToRider } from '@/lib/riders/dispatch'

const VENDOR_TRANSITIONS = {
  CONFIRMED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CANCELLED'],
  // Fallback only — when Toofan not yet integrated:
  DISPATCHED: ['DELIVERED'],
  DELIVERED:  ['COMPLETED'],
}

// GET — customer views their own order detail, OR vendor views their own order
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { supabase, entityId, userId } = ctx

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_no, order_type, order_source, status, grand_total, gst_total, subtotal,
        payment_method, delivery_address, delivery_lat, delivery_lng, fulfilment_mode, dispatch_state,
        buyer_whatsapp, created_at, updated_at, completed_at, cancelled_at,
        seller_id, buyer_id, delivery_otp,
        seller:entities!seller_id(id, name, tpn_gstin, whatsapp_no)
      `)
      .eq('id', id)
      .eq('order_type', 'MARKETPLACE')
      .single()

    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Get customer phone for customer access check
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    const customerPhone = user?.user_metadata?.phone

    const isCustomer = customerPhone && order.buyer_whatsapp === customerPhone
    const isVendor = entityId && order.seller_id === entityId

    if (!isCustomer && !isVendor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch items and timeline in parallel
    const [{ data: items }, { data: timeline }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', id).order('id'),
      supabase.from('order_status_log').select('*').eq('order_id', id).order('created_at'),
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
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx

    const body = await request.json()
    const { status: newStatus, reason } = body

    if (!newStatus) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    if (!entityId) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_no, status, seller_id, buyer_whatsapp, payment_token, grand_total, delivery_address, delivery_lat, delivery_lng')
      .eq('id', id)
      .eq('order_type', 'MARKETPLACE')
      .single()

    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.seller_id !== entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)

    if (updateError) throw updateError

    // Log status change manually (DB trigger handles it, but log reason if provided)
    if (reason) {
      await supabase.from('order_status_log').insert({
        order_id: id,
        from_status: order.status,
        to_status: newStatus,
        actor_id: userId,
        reason,
      }).catch(() => {})
    }

    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // On PROCESSING or CONFIRMED: push to the least-loaded on-shift rider (delivery orders only;
    // the dispatch lib no-ops for pickup orders and when the order already has a rider).
    if (newStatus === 'PROCESSING' || newStatus === 'CONFIRMED') {
      await assignOrderToRider(supabase, id)
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
