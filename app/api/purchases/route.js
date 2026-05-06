import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

async function getVendorSession(cookieStore) {
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
  return session
}

// GET — list POs and Invoices for the authenticated vendor
export async function GET(request) {
  try {
    const cookieStore = await cookies()
    const session = await getVendorSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceClient()
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const type   = searchParams.get('type')   // 'PO' | 'INVOICE' | null = all
    const status = searchParams.get('status')
    const limit  = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    let query = serviceClient
      .from('orders')
      .select(`
        id, order_no, order_type, status, grand_total, gst_total, subtotal,
        payment_method, supplier_name, supplier_ref, expected_delivery,
        purchase_order_id, received_at, created_at, updated_at,
        seller:entities!seller_id(id, name, whatsapp_no)
      `)
      .eq('buyer_id', profile.entity_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type === 'PO')      query = query.eq('order_type', 'PURCHASE_ORDER')
    else if (type === 'INVOICE') query = query.eq('order_type', 'PURCHASE_INVOICE')
    else                    query = query.in('order_type', ['PURCHASE_ORDER', 'PURCHASE_INVOICE'])

    if (status) query = query.eq('status', status)

    const { data: orders, error } = await query
    if (error) throw error

    // Enrich invoices with referenced PO order_no
    const poIds = (orders || []).filter(o => o.purchase_order_id).map(o => o.purchase_order_id)
    if (poIds.length > 0) {
      const { data: poOrders } = await serviceClient
        .from('orders')
        .select('id, order_no')
        .in('id', poIds)
      const poMap = Object.fromEntries((poOrders || []).map(po => [po.id, po.order_no]))
      for (const o of (orders || [])) {
        if (o.purchase_order_id) o.purchase_order_no = poMap[o.purchase_order_id] || null
      }
    }

    return NextResponse.json({ orders: orders || [] })

  } catch (error) {
    console.error('[purchases GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — create a new Purchase Order
export async function POST(request) {
  try {
    const cookieStore = await cookies()
    const session = await getVendorSession(cookieStore)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceClient()
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })

    const vendorEntityId = profile.entity_id

    const body = await request.json()
    const { supplier_id, supplier_name, supplier_ref, expected_delivery, payment_method, items } = body

    if (!items?.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    if (!payment_method) return NextResponse.json({ error: 'Payment method is required' }, { status: 400 })
    if (!['ONLINE', 'CASH', 'CREDIT'].includes(payment_method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }

    // Resolve supplier entity
    let supplierEntityId = supplier_id || null
    let resolvedSupplierName = supplier_name?.trim() || null

    if (!supplierEntityId && resolvedSupplierName) {
      // Look up by name (case-insensitive) or create new WHOLESALER entity
      const { data: existing } = await serviceClient
        .from('entities')
        .select('id, name')
        .ilike('name', resolvedSupplierName)
        .eq('role', 'WHOLESALER')
        .limit(1)
        .single()

      if (existing) {
        supplierEntityId = existing.id
        resolvedSupplierName = existing.name
      } else {
        const { data: newEntity, error: entityErr } = await serviceClient
          .from('entities')
          .insert({ name: resolvedSupplierName, role: 'WHOLESALER', is_active: true })
          .select('id')
          .single()
        if (entityErr) throw entityErr
        supplierEntityId = newEntity.id
      }
    }

    if (!supplierEntityId && !resolvedSupplierName) {
      return NextResponse.json({ error: 'Supplier ID or name is required' }, { status: 400 })
    }

    // Validate products
    const productIds = items.map(i => i.product_id)
    const { data: products } = await serviceClient
      .from('products')
      .select('id, name, sku, mrp, wholesale_price, is_active')
      .in('id', productIds)

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

    const orderItems = []
    let subtotal = 0

    for (const item of items) {
      const product = productMap[item.product_id]
      if (!product) return NextResponse.json({ error: `Product ${item.product_id} not found` }, { status: 404 })
      if (!product.is_active) return NextResponse.json({ error: `Product "${product.name}" is not active` }, { status: 400 })

      const unitCost = item.unit_cost ? parseFloat(item.unit_cost) : parseFloat(product.wholesale_price || product.mrp || 0)
      const qty = parseInt(item.quantity, 10)
      if (qty < 1) return NextResponse.json({ error: `Invalid quantity for "${product.name}"` }, { status: 400 })

      const total = unitCost * qty
      subtotal += total

      orderItems.push({
        product_id: product.id,
        sku:        product.sku,
        name:       product.name,
        quantity:   qty,
        unit_price: unitCost,  // unit_price = unit_cost for purchase orders
        unit_cost:  unitCost,
        discount:   0,
        gst_5:      0,         // GST not charged at purchase level
        total,
        status:     'ACTIVE',
      })
    }

    const grandTotal = parseFloat(subtotal.toFixed(2))

    // Generate PO number: PO-YYYY-XXXXX
    const year = new Date().getFullYear()
    const { data: lastOrder } = await serviceClient
      .from('orders')
      .select('order_no')
      .like('order_no', `PO-${year}-%`)
      .order('order_no', { ascending: false })
      .limit(1)
      .single()

    const lastSerial = lastOrder?.order_no ? parseInt(lastOrder.order_no.split('-')[2] || '0', 10) : 0
    const orderNo = `PO-${year}-${String(lastSerial + 1).padStart(5, '0')}`

    // Create order
    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      .insert({
        order_type:        'PURCHASE_ORDER',
        order_no:          orderNo,
        status:            'DRAFT',
        seller_id:         supplierEntityId || vendorEntityId, // seller = supplier
        buyer_id:          vendorEntityId,                     // buyer = vendor receiving goods
        supplier_name:     supplierEntityId ? null : resolvedSupplierName,
        supplier_ref:      supplier_ref?.trim() || null,
        expected_delivery: expected_delivery || null,
        payment_method,
        items:             orderItems,
        subtotal:          grandTotal,
        gst_total:         0,
        grand_total:       grandTotal,
        created_by:        session.user.id,
      })
      .select('id, order_no, status, grand_total')
      .single()

    if (orderErr) throw orderErr

    // Insert order_items
    await serviceClient.from('order_items').insert(
      orderItems.map(item => ({ order_id: order.id, ...item }))
    )

    return NextResponse.json({ order })

  } catch (error) {
    console.error('[purchases POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
