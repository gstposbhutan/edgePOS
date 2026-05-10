import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

// Create a true service client that bypasses RLS
function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function getContext(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    console.error('[wholesale/orders] No auth header')
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  const authClient = createSSRServiceClient()
  const { data: { user }, error: userError } = await authClient.auth.getUser(token)

  if (userError || !user) {
    console.error('[wholesale/orders] Auth failed:', userError)
    return null
  }

  let entityId = user.app_metadata?.entity_id
  let role = user.app_metadata?.role

  // Fallback: if claims not in app_metadata (hook not registered), query user_profiles
  if (!entityId || !role) {
    console.log('[wholesale/orders] Missing claims, querying user_profiles')
    const supabase = createBypassClient()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('entity_id, role')
      .eq('id', user.id)
      .single()

    if (profile) {
      entityId = entityId || profile.entity_id
      role = role || profile.role
      console.log('[wholesale/orders] Found claims from user_profiles:', { entityId, role })
    } else {
      console.error('[wholesale/orders] No profile found for user:', user.id)
      return null
    }
  }

  if (!entityId) {
    console.error('[wholesale/orders] No entity_id found')
    return null
  }

  console.log('[wholesale/orders] Context:', { entityId, role, userId: user.id })
  return { entityId, role, userId: user.id }
}

/** POST /api/wholesale/orders — create a purchase order */
export async function POST(request) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, role, userId } = ctx
  if (role !== 'RETAILER') {
    return NextResponse.json({ error: 'Only retailers can place wholesale orders' }, { status: 403 })
  }

  const body = await request.json()
  const { wholesaler_id, items } = body

  if (!wholesaler_id || !items?.length) {
    return NextResponse.json({ error: 'wholesaler_id and items[] required' }, { status: 400 })
  }

  // Use bypass client for all queries
  const supabase = createBypassClient()

  // Verify connection
  const { data: connection } = await supabase
    .from('retailer_wholesalers')
    .select('wholesaler_id')
    .eq('retailer_id', entityId)
    .eq('wholesaler_id', wholesaler_id)
    .eq('active', true)
    .limit(1)

  if (!connection?.length) {
    return NextResponse.json({ error: 'Not connected to this wholesaler' }, { status: 403 })
  }

  // Fetch product details and validate
  const productIds = items.map(i => i.product_id)
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, sku, wholesale_price, current_stock, hsn_code')
    .in('id', productIds)
    .eq('created_by', wholesaler_id)
    .eq('is_active', true)

  if (prodErr) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  // Validate all products belong to wholesaler
  for (const item of items) {
    if (!productMap[item.product_id]) {
      return NextResponse.json({ error: `Product ${item.product_id} not found in wholesaler catalog` }, { status: 400 })
    }
    if (!item.quantity || item.quantity < 1) {
      return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })
    }
  }

  // Calculate totals
  let subtotal = 0
  const orderItems = items.map(item => {
    const p = productMap[item.product_id]
    const unitPrice = parseFloat(p.wholesale_price)
    const qty = item.quantity
    const discount = 0
    const gst5 = parseFloat((unitPrice * qty * 0.05).toFixed(2))
    const total = parseFloat((unitPrice * qty + gst5).toFixed(2))
    subtotal += unitPrice * qty

    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      quantity: qty,
      unit_price: unitPrice,
      discount,
      gst_5: gst5,
      total,
      status: 'ACTIVE',
    }
  })

  const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
  const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

  // Generate order number
  const year = new Date().getFullYear()
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('order_no')
    .like('order_no', `WHL-${year}-%`)
    .order('created_at', { ascending: false })
    .limit(1)

  let serial = 1
  if (lastOrder?.length) {
    const match = lastOrder[0].order_no.match(/WHL-\d+-(\d+)/)
    if (match) serial = parseInt(match[1]) + 1
  }
  const orderNo = `WHL-${year}-${String(serial).padStart(4, '0')}`

  // Create order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_type: 'WHOLESALE',
      order_no: orderNo,
      status: 'DRAFT',
      seller_id: wholesaler_id,
      buyer_id: entityId,
      items: orderItems.map(i => ({
        product_id: i.product_id,
        sku: i.sku,
        name: i.name,
        qty: i.quantity,
        rate: i.unit_price,
        discount: i.discount,
        gst_5: i.gst_5,
        total: i.total,
      })),
      subtotal,
      gst_total: gstTotal,
      grand_total: grandTotal,
      payment_method: 'CREDIT',
      created_by: userId,
    })
    .select('id, order_no, status, grand_total')
    .single()

  if (orderErr) {
    console.error('Order insert error:', orderErr)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }

  // Insert order_items
  const itemRows = orderItems.map((item, idx) => ({
    id: `00000000-0000-4000-8000-${String(Date.now()).slice(-12 + idx.toString().length).padStart(12, '0')}${String(idx).padStart(2, '0')}`,
    order_id: order.id,
    ...item,
  }))

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(itemRows)

  if (itemsErr) {
    console.error('Order items insert error:', itemsErr)
    // Order created but items failed — still return order, items can be retried
    return NextResponse.json({ order, warning: 'Order created but items failed' })
  }

  // Move to CONFIRMED — triggers stock deduction for wholesaler
  const { error: confirmErr } = await supabase
    .from('orders')
    .update({ status: 'CONFIRMED' })
    .eq('id', order.id)

  if (confirmErr) {
    console.error('Order confirm error:', confirmErr)
    // Order created as DRAFT, can be manually confirmed
  } else {
    order.status = 'CONFIRMED'
  }

  return NextResponse.json({ order }, { status: 201 })
}

/** GET /api/wholesale/orders — list wholesale orders */
export async function GET(request) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, role } = ctx
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')

  const supabase = createBypassClient()

  let query = supabase
    .from('orders')
    .select('id, order_no, status, subtotal, gst_total, grand_total, created_at, buyer_id, seller_id')
    .eq('order_type', 'WHOLESALE')
    .order('created_at', { ascending: false })
    .limit(limit)

  // Filter by role
  if (role === 'RETAILER') {
    query = query.eq('buyer_id', entityId)
  } else {
    query = query.eq('seller_id', entityId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data: orders, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with counter-party entity names
  if (orders?.length) {
    const partyIds = [...new Set(orders.flatMap(o => [o.seller_id, o.buyer_id]))]
    const { data: entities } = await supabase
      .from('entities')
      .select('id, name')
      .in('id', partyIds)

    const entityMap = Object.fromEntries((entities || []).map(e => [e.id, e.name]))

    orders.forEach(o => {
      o.seller_name = entityMap[o.seller_id] || 'Unknown'
      o.buyer_name = entityMap[o.buyer_id] || 'Unknown'
    })
  }

  return NextResponse.json({ orders })
}
