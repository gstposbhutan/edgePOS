import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'node:crypto'
import { notifyEntity } from '@/lib/email/notify'
import { assignOrderToRider } from '@/lib/riders/dispatch'

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, supabase } = ctx

    // Get customer phone from user metadata via auth admin
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    const customerPhone = user?.user_metadata?.phone

    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer phone not found in session' }, { status: 400 })
    }

    const body = await request.json()
    const { delivery_address, delivery_lat, delivery_lng } = body
    // Address requirement is deferred until we know each vendor's delivery_mode — pickup-only
    // vendors don't need one (checked after the carts + their vendors are loaded, below).

    // Get customer's entity record (id = auth user id per migration 041)
    const { data: customerEntity } = await supabase
      .from('entities')
      .select('id')
      .eq('id', userId)
      .single()

    const buyerId = customerEntity?.id ?? null

    // Fetch all active carts with items
    const { data: carts, error: cartsError } = await supabase
      .from('carts')
      .select('id, entity_id, entities!inner(id, name, tpn_gstin, whatsapp_no, delivery_mode)')
      .eq('customer_whatsapp', customerPhone)
      .eq('status', 'ACTIVE')

    if (cartsError) throw cartsError
    if (!carts?.length) {
      return NextResponse.json({ error: 'No active carts found' }, { status: 400 })
    }

    const cartsWithItems = await Promise.all(
      carts.map(async (cart) => {
        const { data: items } = await supabase
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

    // A delivery address is only required when at least one vendor actually ships (DELIVERY mode).
    // Pickup-only / catalog vendors don't collect an address — the buyer collects in person.
    const anyDelivery = nonEmptyCarts.some(c => (c.entities?.delivery_mode || 'DELIVERY') === 'DELIVERY')
    if (anyDelivery && !delivery_address?.trim()) {
      return NextResponse.json({ error: 'Delivery address is required' }, { status: 400 })
    }

    const year = new Date().getFullYear()

    // Generate sequential MKT order number
    async function generateOrderNo() {
      const { data } = await supabase
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
      const fulfilmentMode = (vendor?.delivery_mode || 'DELIVERY') === 'DELIVERY' ? 'DELIVERY' : 'PICKUP'
      const isDelivery = fulfilmentMode === 'DELIVERY'

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

        const { data: order, error: orderError } = await supabase
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
            fulfilment_mode: fulfilmentMode,
            delivery_address: isDelivery ? delivery_address : 'Pickup — collect at store',
            delivery_lat: isDelivery ? (delivery_lat ?? null) : null,
            delivery_lng: isDelivery ? (delivery_lng ?? null) : null,
            payment_token: paymentToken,
            payment_token_expires_at: paymentTokenExpiresAt,
            digital_signature: signature,
            created_by: userId,
          })
          .select('id, order_no')
          .single()

        if (orderError) throw new Error(orderError.message)

        await supabase.from('order_items').insert(
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

        // Push to the least-loaded on-shift rider (even + location-aware). Pickup-only vendors skip
        // the rider flow entirely — the buyer collects the order in person.
        if (isDelivery) {
          await assignOrderToRider(supabase, order.id)
        }

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

        // Notifications: always in-app; emailed only if the recipient opted in (email off by default).
        await notifyEntity(supabase, cart.entity_id, {
          type: 'ORDER',
          title: `New ${isDelivery ? 'delivery' : 'pickup'} order ${order.order_no} — Nu. ${grandTotal.toFixed(2)}`,
          body: `${cart.items.length} item(s) · Nu. ${grandTotal.toFixed(2)} incl. 5% GST · ${isDelivery ? 'Delivery' : 'Pickup'}`,
          link: `/pos/orders/${order.id}`,
        })

        // Low-stock: any ordered product now at/below its reorder point (stock just decremented).
        const pids = [...new Set(cart.items.map(i => i.product_id).filter(Boolean))]
        if (pids.length) {
          const { data: prods } = await supabase
            .from('products').select('name, current_stock, reorder_point').in('id', pids)
          const low = (prods || []).filter(p => Number(p.current_stock) <= Number(p.reorder_point ?? 0))
          if (low.length) {
            await notifyEntity(supabase, cart.entity_id, {
              type: 'LOW_STOCK',
              title: `Low stock on ${low.length} item${low.length === 1 ? '' : 's'}`,
              body: low.map(p => `• ${p.name} — ${p.current_stock} left (reorder at ${p.reorder_point ?? 0})`).join('\n'),
              link: '/pos/products',
            })
          }
        }

        // Customer receipt (in-app; emailed only if the customer opted in + has a real address).
        if (buyerId) {
          await notifyEntity(supabase, buyerId, {
            type: 'RECEIPT',
            title: `Order ${order.order_no} placed`,
            body: `${vendor.name} · Nu. ${grandTotal.toFixed(2)} incl. 5% GST · ${isDelivery ? 'Delivery' : 'Pickup — collect at store'}`,
            link: '/shop/orders',
          })
        }

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
