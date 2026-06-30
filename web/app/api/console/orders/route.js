import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Orders for the distributor / wholesaler consoles. Two halves of the same B2B flow:
//
//   GET  — incoming orders where I am the seller (sales TO me's buyers). Read-only list for both
//          consoles, scoped to ctx.entityId, OWNER/MANAGER gated.
//   POST — buyer restock: a wholesaler orders from a linked distributor's catalog. This clones the
//          retailer→wholesaler logic from /api/wholesale/orders, only flipped one tier up:
//          seller_id = the distributor (supplier), buyer_id = my entity (the wholesaler), the unit
//          price comes from products.distributor_price, and the same orders triggers
//          (deduct_stock_on_confirm, khata_debit_on_confirm) fire on CONFIRMED exactly as they do
//          for the retailer flow. We do NOT touch the retailer routes — this is a parallel copy in
//          the console namespace so the two tiers can diverge later.

/** GET /api/console/orders — incoming orders where this entity is the seller. */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, subtotal, gst_total, grand_total, payment_method, created_at, buyer_id, seller_id, items')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data: orders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with the buyer's business name (the counter-party on an incoming order).
    if (orders?.length) {
      const buyerIds = [...new Set(orders.map(o => o.buyer_id).filter(Boolean))]
      if (buyerIds.length) {
        const { data: entities } = await supabase
          .from('entities')
          .select('id, name')
          .in('id', buyerIds)
        const nameById = Object.fromEntries((entities || []).map(e => [e.id, e.name]))
        orders.forEach(o => { o.buyer_name = nameById[o.buyer_id] || 'Unknown' })
      } else {
        orders.forEach(o => { o.buyer_name = o.buyer_id ? 'Unknown' : 'Walk-in' })
      }
    }

    return NextResponse.json({ orders: orders ?? [] })
  } catch (err) {
    console.error('[console/orders] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/orders — wholesaler places a restock order with a linked distributor. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, role, userId, supabase } = ctx
    if (role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers can order from distributors' }, { status: 403 })
    }

    const body = await request.json()
    const { supplier_id, items } = body
    if (!supplier_id || !items?.length) {
      return NextResponse.json({ error: 'supplier_id and items[] required' }, { status: 400 })
    }

    // Verify the distributor↔wholesaler link (mirror the retailer_wholesalers check).
    const { data: link } = await supabase
      .from('distributor_wholesalers')
      .select('distributor_id')
      .eq('distributor_id', supplier_id)
      .eq('wholesaler_id', entityId)
      .eq('active', true)
      .limit(1)

    if (!link?.length) {
      return NextResponse.json({ error: 'Not linked to this distributor' }, { status: 403 })
    }

    // Fetch the distributor's sellable products and validate the cart against them.
    const productIds = items.map(i => i.product_id)
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku, distributor_price, wholesale_price, current_stock, hsn_code')
      .in('id', productIds)
      .eq('created_by', supplier_id)
      .eq('is_active', true)

    if (prodErr) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

    for (const item of items) {
      if (!productMap[item.product_id]) {
        return NextResponse.json({ error: `Product ${item.product_id} not found in distributor catalog` }, { status: 400 })
      }
      if (!item.quantity || item.quantity < 1) {
        return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })
      }
    }

    // Build line items. Buy price = distributor_price, falling back to wholesale_price if a
    // product has no distributor rate set. GST is the flat 5%, tax-exclusive, per line.
    let subtotal = 0
    const orderItems = items.map(item => {
      const p = productMap[item.product_id]
      const unitPrice = parseFloat(p.distributor_price ?? p.wholesale_price ?? 0)
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

    // Order number — same WHL-YYYY-NNNN series the wholesale flow uses (it's the same order_type).
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

    // Create the order as DRAFT — seller is the distributor, buyer is me (the wholesaler).
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_type: 'WHOLESALE',
        order_no: orderNo,
        status: 'DRAFT',
        seller_id: supplier_id,
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
      console.error('[console/orders] order insert error:', orderErr)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Insert order_items (same shape as the wholesale flow). Each row gets a fresh UUID.
    const itemRows = orderItems.map(item => ({
      id: crypto.randomUUID(),
      order_id: order.id,
      ...item,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(itemRows)
    if (itemsErr) {
      console.error('[console/orders] order items insert error:', itemsErr)
      return NextResponse.json({ order, warning: 'Order created but items failed' })
    }

    // Move to CONFIRMED — this fires the same triggers as the retailer flow: distributor stock is
    // deducted and the wholesaler's khata with the distributor is debited (credit-limit checked).
    const { error: confirmErr } = await supabase
      .from('orders')
      .update({ status: 'CONFIRMED' })
      .eq('id', order.id)

    if (confirmErr) {
      console.error('[console/orders] order confirm error:', confirmErr)
      // Left as DRAFT — surface a warning so the caller knows it wasn't confirmed.
      return NextResponse.json({ order, warning: confirmErr.message })
    }
    order.status = 'CONFIRMED'

    return NextResponse.json({ order }, { status: 201 })
  } catch (err) {
    console.error('[console/orders] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
