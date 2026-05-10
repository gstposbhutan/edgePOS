import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'node:crypto'

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

// GET — customer's own MARKETPLACE orders
export async function GET(request) {
  try {
    const cookieStore = await cookies()
    const session = await getSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const customerPhone = session.user.user_metadata?.phone
    if (!customerPhone) return NextResponse.json({ error: 'Customer phone not found' }, { status: 400 })

    const serviceClient = createServiceClient()

    const { data: orders, error } = await serviceClient
      .from('orders')
      .select(`
        id, order_no, order_source, status, grand_total, gst_total, subtotal,
        payment_method, delivery_address, created_at, updated_at,
        seller_id, entities!seller_id(id, name, whatsapp_no)
      `)
      .eq('buyer_whatsapp', customerPhone)
      .eq('order_type', 'MARKETPLACE')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ orders: orders || [] })

  } catch (error) {
    console.error('[shop/orders GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — vendor creates a MARKETPLACE order on behalf of a customer
export async function POST(request) {
  try {
    const cookieStore = await cookies()
    const session = await getSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceClient()

    // Resolve vendor entity
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id, role')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) {
      return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })
    }

    const sellerId = profile.entity_id

    // Fetch vendor entity for GST + WhatsApp
    const { data: vendor } = await serviceClient
      .from('entities')
      .select('id, name, tpn_gstin, whatsapp_no')
      .eq('id', sellerId)
      .single()

    if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 403 })

    const body = await request.json()
    const { customer_whatsapp, customer_name, delivery_address, delivery_lat, delivery_lng, items,
            order_type: requestedOrderType } = body
    // Allow SALES_ORDER type for vendor-initiated sales (no immediate stock deduction)
    const isSalesOrder = requestedOrderType === 'SALES_ORDER'

    // Validate required fields
    if (!customer_whatsapp || !/^\+?[0-9]{8,15}$/.test(customer_whatsapp.replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Valid customer WhatsApp number is required' }, { status: 400 })
    }
    if (!items?.length) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const phone = customer_whatsapp.startsWith('+') ? customer_whatsapp : `+${customer_whatsapp}`

    // Find or auto-create customer entity
    let { data: customerEntity } = await serviceClient
      .from('entities')
      .select('id')
      .eq('whatsapp_no', phone)
      .eq('role', 'CUSTOMER')
      .single()

    if (!customerEntity) {
      // Auto-create customer — same pattern as whatsapp/verify/route.js
      const tempEmail = `customer_${Date.now()}@example.com`
      const tempPassword = 'TempPass' + Math.random().toString(36).substring(2, 10) + Date.now().toString().substring(0, 6)

      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email: tempEmail,
        password: tempPassword,
        email_confirm: true,
      })

      if (authError || !authData.user) {
        return NextResponse.json({ error: 'Failed to create customer account: ' + (authError?.message ?? 'Unknown') }, { status: 500 })
      }

      const authUserId = authData.user.id
      const displayName = customer_name?.trim() || `Customer ${phone.slice(-4)}`

      const { data: newEntity, error: entityError } = await serviceClient
        .from('entities')
        .insert({ id: authUserId, name: displayName, whatsapp_no: phone, role: 'CUSTOMER', is_active: true })
        .select('id')
        .single()

      if (entityError || !newEntity) {
        await serviceClient.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: 'Failed to create customer entity' }, { status: 500 })
      }

      await serviceClient.from('user_profiles').insert({
        id: authUserId,
        entity_id: newEntity.id,
        role: 'CUSTOMER',
        sub_role: 'CUSTOMER',
        full_name: displayName,
      })

      await serviceClient.auth.admin.updateUserById(authUserId, {
        user_metadata: { phone, phone_verified: false, role: 'CUSTOMER' },
      })

      customerEntity = newEntity
    }

    // Validate products are active and this vendor has stock (batch or product-level)
    const productIds = items.map(i => i.product_id)
    const { data: products, error: productsError } = await serviceClient
      .from('products')
      .select('id, name, sku, mrp, current_stock, is_active')
      .in('id', productIds)

    if (productsError) throw productsError

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

    // Fetch this vendor's active batch totals for each product
    const { data: batchTotals } = await serviceClient
      .from('product_batches')
      .select('product_id, quantity')
      .eq('entity_id', sellerId)
      .eq('status', 'ACTIVE')
      .in('product_id', productIds)

    const batchStockMap = {}
    for (const b of (batchTotals || [])) {
      batchStockMap[b.product_id] = (batchStockMap[b.product_id] || 0) + b.quantity
    }

    for (const item of items) {
      const product = productMap[item.product_id]
      if (!product) return NextResponse.json({ error: `Product ${item.product_id} not found` }, { status: 404 })
      if (!product.is_active) return NextResponse.json({ error: `Product "${product.name}" is not active` }, { status: 400 })
      // Vendor must have batch stock for this product (or product-level stock as fallback)
      const vendorStock = batchStockMap[item.product_id] ?? product.current_stock ?? 0
      if (vendorStock <= 0) return NextResponse.json({ error: `"${product.name}" is not stocked by your store` }, { status: 403 })
      if (vendorStock < item.quantity) return NextResponse.json({ error: `Insufficient stock for "${product.name}"` }, { status: 400 })
    }

    // Calculate totals
    let subtotal = 0
    const orderItems = items.map(item => {
      const product = productMap[item.product_id]
      const unitPrice = parseFloat(product.mrp)
      const qty = item.quantity
      const gst5 = parseFloat((unitPrice * qty * 0.05).toFixed(2))
      const total = parseFloat((unitPrice * qty + gst5).toFixed(2))
      subtotal += unitPrice * qty
      return {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        discount: 0,
        gst_5: gst5,
        total,
        status: 'ACTIVE',
      }
    })

    const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
    const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

    // Generate order number
    const year = new Date().getFullYear()
    const prefix = isSalesOrder ? 'SO' : 'MKT'
    const { data: lastOrder } = await serviceClient
      .from('orders')
      .select('order_no')
      .like('order_no', `${prefix}-${year}-%`)
      .order('order_no', { ascending: false })
      .limit(1)
      .single()

    const lastSerial = lastOrder?.order_no ? parseInt(lastOrder.order_no.split('-')[2] ?? '0', 10) : 0
    const orderNo = `${prefix}-${year}-${String(lastSerial + 1).padStart(5, '0')}`

    const signature = createHash('sha256')
      .update(`${orderNo}:${grandTotal}:${vendor.tpn_gstin ?? ''}`)
      .digest('hex')

    const paymentToken = randomBytes(32).toString('hex')
    const paymentTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .insert({
        order_type:   isSalesOrder ? 'SALES_ORDER' : 'MARKETPLACE',
        order_no:     orderNo,
        order_source: 'POS',
        status:       isSalesOrder ? 'DRAFT' : 'CONFIRMED',
        seller_id: sellerId,
        buyer_id: customerEntity.id,
        buyer_whatsapp: phone,
        items: orderItems,
        subtotal,
        gst_total: gstTotal,
        grand_total: grandTotal,
        payment_method: 'CREDIT',
        delivery_address: delivery_address ?? null,
        delivery_lat: delivery_lat ?? null,
        delivery_lng: delivery_lng ?? null,
        payment_token: isSalesOrder ? null : paymentToken,
        payment_token_expires_at: isSalesOrder ? null : paymentTokenExpiresAt,
        digital_signature: signature,
        created_by: session.user.id,
      })
      .select('id, order_no')
      .single()

    if (orderError) throw new Error(orderError.message)

    await serviceClient.from('order_items').insert(
      orderItems.map(item => ({ order_id: order.id, ...item }))
    )

    // Notify customer (fire-and-forget)
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    fetch(`${gatewayUrl}/api/send-order-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        orders: [{ order_no: order.order_no, seller_name: vendor.name, grand_total: grandTotal }],
        totalAmount: grandTotal,
      }),
    }).catch(() => {})

    return NextResponse.json({
      order: { id: order.id, order_no: order.order_no, grand_total: grandTotal, status: 'CONFIRMED' },
    })

  } catch (error) {
    console.error('[shop/orders POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
