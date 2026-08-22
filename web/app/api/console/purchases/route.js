import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Distributor/wholesaler purchases from external suppliers (vendor consoles). Parallel copy of
// /api/purchases, tier-gated. A PO is a request to a supplier; receiving it (convert → confirm)
// stocks a chosen warehouse and, on credit, debits the supplier khata.
//   GET  — list this entity's POs + PIs (buyer_id = me).
//   POST — create a PO. Supplier is an existing entity (supplier_id), matched by name, or auto-created
//          as a WHOLESALER entity; else stored free-text. Lines are the caller's own products.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')   // 'PO' | 'INVOICE' | null
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, grand_total, subtotal, payment_method, supplier_name, supplier_ref, expected_delivery, purchase_order_id, warehouse_id, received_at, created_at, seller:entities!seller_id(id, name)')
      .eq('buyer_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (type === 'PO') query = query.eq('order_type', 'PURCHASE_ORDER')
    else if (type === 'INVOICE') query = query.eq('order_type', 'PURCHASE_INVOICE')
    else query = query.in('order_type', ['PURCHASE_ORDER', 'PURCHASE_INVOICE'])

    const { data: orders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (orders || []).map(o => ({ ...o, supplier: o.supplier_name || o.seller?.name || 'Supplier', seller: undefined }))
    return NextResponse.json({ orders: rows })
  } catch (err) {
    console.error('[console/purchases] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, userId, supabase } = ctx
    const { supplier_id, supplier_name, supplier_ref, expected_delivery, payment_method, items } = await request.json().catch(() => ({}))

    if (!items?.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    if (!['ONLINE', 'CASH', 'CREDIT'].includes(payment_method)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })

    // Resolve the supplier: given id, matched by name, or auto-created as a WHOLESALER entity.
    let supplierEntityId = supplier_id || null
    let resolvedName = supplier_name?.trim() || null
    if (!supplierEntityId && resolvedName) {
      const { data: existing } = await supabase
        .from('entities').select('id, name').ilike('name', resolvedName).eq('role', 'WHOLESALER').limit(1).maybeSingle()
      if (existing) { supplierEntityId = existing.id; resolvedName = existing.name }
      else {
        const { data: created, error: eErr } = await supabase
          .from('entities').insert({ name: resolvedName, role: 'WHOLESALER', is_active: true }).select('id').single()
        if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
        supplierEntityId = created.id
      }
    }
    if (!supplierEntityId && !resolvedName) return NextResponse.json({ error: 'Supplier id or name is required' }, { status: 400 })

    // Lines are the caller's own products (receiving into their own catalog).
    const productIds = items.map(i => i.product_id)
    const { data: products } = await supabase
      .from('products').select('id, name, sku, mrp, wholesale_price, manufacturer_price, is_active')
      .in('id', productIds).eq('created_by', entityId)
    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

    const orderItems = []
    let subtotal = 0
    for (const item of items) {
      const p = productMap[item.product_id]
      if (!p) return NextResponse.json({ error: `Product ${item.product_id} not in your catalog` }, { status: 400 })
      if (!p.is_active) return NextResponse.json({ error: `"${p.name}" is not active` }, { status: 400 })
      const qty = parseInt(item.quantity, 10)
      if (!qty || qty < 1) return NextResponse.json({ error: `Invalid quantity for "${p.name}"` }, { status: 400 })
      const unitCost = item.unit_cost != null ? parseFloat(item.unit_cost) : parseFloat(p.manufacturer_price || p.wholesale_price || p.mrp || 0)
      const total = unitCost * qty
      subtotal += total
      orderItems.push({ product_id: p.id, sku: p.sku, name: p.name, quantity: qty, unit_price: unitCost, unit_cost: unitCost, discount: 0, gst_5: 0, total, status: 'ACTIVE' })
    }
    const grandTotal = parseFloat(subtotal.toFixed(2))

    const year = new Date().getFullYear()
    const { data: last } = await supabase.from('orders').select('order_no').like('order_no', `PO-${year}-%`).order('order_no', { ascending: false }).limit(1).maybeSingle()
    const serial = last?.order_no ? parseInt(last.order_no.split('-')[2] || '0', 10) : 0
    const orderNo = `PO-${year}-${String(serial + 1).padStart(5, '0')}`

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_type: 'PURCHASE_ORDER', order_no: orderNo, status: 'DRAFT',
        seller_id: supplierEntityId || entityId, buyer_id: entityId,
        supplier_name: supplierEntityId ? null : resolvedName, supplier_ref: supplier_ref?.trim() || null,
        expected_delivery: expected_delivery || null, payment_method,
        items: orderItems, subtotal: grandTotal, gst_total: 0, grand_total: grandTotal, created_by: userId,
      })
      .select('id, order_no, status, grand_total')
      .single()
    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

    await supabase.from('order_items').insert(orderItems.map(i => ({ order_id: order.id, ...i })))
    return NextResponse.json({ order }, { status: 201 })
  } catch (err) {
    console.error('[console/purchases] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
