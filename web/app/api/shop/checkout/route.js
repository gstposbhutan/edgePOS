import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'node:crypto'

async function assignRider(serviceClient, orderId, order) {
  try {
    const { data: riders } = await serviceClient
      .from('riders')
      .select('id, name, whatsapp_no')
      .eq('is_active', true)
      .eq('is_available', true)
      .is('current_order_id', null)
      .order('created_at', { ascending: true })
      .limit(1)

    const rider = riders?.[0]
    if (!rider) return

    const pickupOtp = String(Math.floor(100000 + Math.random() * 900000))
    const pickupOtpExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    await serviceClient
      .from('orders')
      .update({
        rider_id:              rider.id,
        rider_accepted_at:     new Date().toISOString(),
        pickup_otp:            pickupOtp,
        pickup_otp_expires_at: pickupOtpExpiresAt,
      })
      .eq('id', orderId)

    await serviceClient
      .from('riders')
      .update({ is_available: false, current_order_id: orderId })
      .eq('id', rider.id)

    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    if (order.seller_whatsapp) {
      fetch(`${gatewayUrl}/api/send-pickup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorPhone: order.seller_whatsapp,
          orderNo:     order.order_no,
          riderName:   rider.name,
          pickupOtp,
        }),
      }).catch(() => {})
    }
  } catch (err) {
    console.error('[checkout/assignRider]', err.message)
  }
}

export async function POST(request) {
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

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customerPhone = session.user.user_metadata?.phone
    const userId = session.user.id

    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer phone not found in session' }, { status: 400 })
    }

    const body = await request.json()
    const { delivery_address, delivery_lat, delivery_lng } = body

    if (!delivery_address?.trim()) {
      return NextResponse.json({ error: 'Delivery address is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Get customer's entity record (id = auth user id per migration 041)
    const { data: customerEntity } = await serviceClient
      .from('entities')
      .select('id')
      .eq('id', userId)
      .single()

    const buyerId = customerEntity?.id ?? null

    // Fetch all active carts with items
    const { data: carts, error: cartsError } = await serviceClient
      .from('carts')
      .select('id, entity_id, entities!inner(id, name, tpn_gstin, whatsapp_no)')
      .eq('customer_whatsapp', customerPhone)
      .eq('status', 'ACTIVE')

    if (cartsError) throw cartsError
    if (!carts?.length) {
      return NextResponse.json({ error: 'No active carts found' }, { status: 400 })
    }

    const cartsWithItems = await Promise.all(
      carts.map(async (cart) => {
        const { data: items } = await serviceClient
          .from('cart_items')
          .select('*')
          .eq('cart_id', cart.id)
        return { ...cart, items: items || [] }
      })
    )

    const nonEmptyCarts = cartsWithItems.filter(c => c.items.length > 0)
    if (!nonEmptyCarts.length) {
      return NextResponse.json({ error: 'All carts are empty' }, { status: 400 })
    }

    const year = new Date().getFullYear()

    // Generate sequential MKT order number
    async function generateOrderNo() {
      const { data } = await serviceClient
        .from('orders')
        .select('order_no')
        .like('order_no', `MKT-${year}-%`)
        .order('order_no', { ascending: false })
        .limit(1)
        .single()

      const lastSerial = data?.order_no
        ? parseInt(data.order_no.split('-')[2] ?? '0', 10)
        : 0
      return `MKT-${year}-${String(lastSerial + 1).padStart(5, '0')}`
    }

    const createdOrders = []
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'

    for (const cart of nonEmptyCarts) {
      const vendor = cart.entities

      try {
        // Recalculate totals server-side — never trust client values
        let subtotal = 0
        for (const item of cart.items) {
          subtotal += parseFloat(item.unit_price) * item.quantity
        }
        const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
        const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

        const orderNo = await generateOrderNo()

        const signature = createHash('sha256')
          .update(`${orderNo}:${grandTotal}:${vendor.tpn_gstin ?? ''}`)
          .digest('hex')

        const paymentToken = randomBytes(32).toString('hex')
        const paymentTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        const { data: order, error: orderError } = await serviceClient
          .from('orders')
          .insert({
            order_type: 'MARKETPLACE',
            order_no: orderNo,
            order_source: 'MARKETPLACE_WEB',
            status: 'CONFIRMED',
            seller_id: cart.entity_id,
            buyer_id: buyerId,
            buyer_whatsapp: customerPhone,
            cart_id: cart.id,
            items: cart.items,
            subtotal,
            gst_total: gstTotal,
            grand_total: grandTotal,
            payment_method: 'CREDIT',
            delivery_address,
            delivery_lat: delivery_lat ?? null,
            delivery_lng: delivery_lng ?? null,
            payment_token: paymentToken,
            payment_token_expires_at: paymentTokenExpiresAt,
            digital_signature: signature,
            created_by: userId,
          })
          .select('id, order_no')
          .single()

        if (orderError) throw new Error(orderError.message)

        await serviceClient.from('order_items').insert(
          cart.items.map(item => ({
            order_id:   order.id,
            product_id: item.product_id,
            batch_id:   item.batch_id ?? null,
            sku:        item.sku,
            name:       item.name,
            quantity:   item.quantity,
            unit_price: item.unit_price,
            discount:   0,
            gst_5:      item.gst_5,
            total:      item.total,
            status:     'ACTIVE',
          }))
        )

        // Auto-assign available rider (fire-and-forget)
        assignRider(serviceClient, order.id, {
          order_no:       order.order_no,
          seller_whatsapp: vendor.whatsapp_no,
        })

        createdOrders.push({
          id: order.id,
          order_no: order.order_no,
          seller_name: vendor.name,
          grand_total: grandTotal,
          status: 'CONFIRMED',
        })

        // Notify vendor (fire-and-forget)
        fetch(`${gatewayUrl}/api/send-order-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorPhone: vendor.whatsapp_no,
            orderNo: order.order_no,
            grandTotal,
            itemCount: cart.items.length,
            customerPhone,
          }),
        }).catch(() => {})

      } catch (err) {
        console.error(`[checkout] Failed to create order for vendor ${vendor.name}:`, err.message)
        createdOrders.push({
          id: null,
          seller_name: vendor.name,
          error: err.message,
        })
      }
    }

    // Notify customer with all confirmed orders (fire-and-forget)
    const confirmed = createdOrders.filter(o => o.id)
    if (confirmed.length > 0) {
      fetch(`${gatewayUrl}/api/send-order-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: customerPhone,
          orders: confirmed,
          totalAmount: confirmed.reduce((s, o) => s + (o.grand_total ?? 0), 0),
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ orders: createdOrders })

  } catch (error) {
    console.error('[checkout] Unexpected error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
