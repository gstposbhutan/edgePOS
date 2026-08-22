import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { ownedWarehouse } from '@/lib/console/inventory'

// Receive a PO into a warehouse by creating a Purchase Invoice (vendor consoles). Full or partial:
// pass per-line received quantities + batch details; validated against what's already invoiced (no
// over-receive). The PI is DRAFT and carries the destination warehouse_id; confirming it stocks that
// warehouse (via restock_on_invoice_confirm). The PO tracks PARTIALLY_RECEIVED → CONFIRMED.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: poId } = await params
    const { entityId, userId, supabase } = ctx
    const { warehouse_id, items } = await request.json().catch(() => ({}))

    const wh = await ownedWarehouse(supabase, entityId, warehouse_id)
    if (!wh) return NextResponse.json({ error: 'Pick a warehouse to receive into' }, { status: 400 })

    const { data: po } = await supabase
      .from('orders').select('id, status, seller_id, buyer_id, supplier_name, supplier_ref, payment_method')
      .eq('id', poId).eq('order_type', 'PURCHASE_ORDER').maybeSingle()
    if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    if (po.buyer_id !== entityId) return NextResponse.json({ error: 'Not your purchase order' }, { status: 403 })
    if (po.status === 'CANCELLED') return NextResponse.json({ error: 'Cannot receive a cancelled PO' }, { status: 409 })
    if (!items?.length) return NextResponse.json({ error: 'At least one line is required' }, { status: 400 })

    const { data: poItems } = await supabase.from('order_items').select('*').eq('order_id', poId)
    const poItemMap = Object.fromEntries((poItems || []).map(i => [i.id, i]))

    // Already invoiced per PO line (by product+sku), across non-cancelled PI children.
    const { data: children } = await supabase
      .from('orders').select('id').eq('purchase_order_id', poId).eq('order_type', 'PURCHASE_INVOICE').neq('status', 'CANCELLED')
    const childIds = (children ?? []).map(c => c.id)
    const invoicedByKey = {}
    if (childIds.length) {
      const { data: rows } = await supabase.from('order_items').select('product_id, sku, quantity').in('order_id', childIds).eq('status', 'ACTIVE')
      for (const r of rows ?? []) { const k = `${r.product_id}:${r.sku}`; invoicedByKey[k] = (invoicedByKey[k] || 0) + r.quantity }
    }

    const invoiceItems = []
    let subtotal = 0
    for (const line of items) {
      const poItem = poItemMap[line.order_item_id]
      if (!poItem) return NextResponse.json({ error: `PO line ${line.order_item_id} not found` }, { status: 404 })
      const qty = parseInt(line.quantity, 10)
      if (!qty || qty < 1) continue
      const key = `${poItem.product_id}:${poItem.sku}`
      const remaining = poItem.quantity - (invoicedByKey[key] || 0)
      if (qty > remaining) return NextResponse.json({ error: `Over-receive for "${poItem.name}": ${remaining} left of ${poItem.quantity}` }, { status: 400 })
      const unitCost = line.unit_cost != null ? parseFloat(line.unit_cost) : parseFloat(poItem.unit_cost ?? poItem.unit_price ?? 0)
      const total = parseFloat((unitCost * qty).toFixed(2))
      subtotal += unitCost * qty
      invoiceItems.push({
        product_id: poItem.product_id, sku: poItem.sku, name: poItem.name, quantity: qty,
        unit_price: unitCost, unit_cost: unitCost, discount: 0, gst_5: 0, total, status: 'ACTIVE',
        batch_number: line.batch_number || null, batch_barcode: line.batch_barcode || null,
        expires_at: line.expires_at || null, manufactured_at: line.manufactured_at || null,
      })
    }
    if (!invoiceItems.length) return NextResponse.json({ error: 'Nothing to receive' }, { status: 400 })
    const grandTotal = parseFloat(subtotal.toFixed(2))

    const year = new Date().getFullYear()
    const { data: last } = await supabase.from('orders').select('order_no').like('order_no', `PI-${year}-%`).order('order_no', { ascending: false }).limit(1).maybeSingle()
    const serial = last?.order_no ? parseInt(last.order_no.split('-')[2] || '0', 10) : 0
    const invoiceNo = `PI-${year}-${String(serial + 1).padStart(5, '0')}`

    const { data: invoice, error: invErr } = await supabase
      .from('orders')
      .insert({
        order_type: 'PURCHASE_INVOICE', order_no: invoiceNo, status: 'DRAFT',
        seller_id: po.seller_id, buyer_id: entityId, purchase_order_id: poId, warehouse_id,
        supplier_name: po.supplier_name, supplier_ref: po.supplier_ref, payment_method: po.payment_method,
        items: invoiceItems, subtotal: grandTotal, gst_total: 0, grand_total: grandTotal, created_by: userId,
      })
      .select('id, order_no, status, grand_total')
      .single()
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
    await supabase.from('order_items').insert(invoiceItems.map(i => ({ order_id: invoice.id, ...i })))

    // PO status: fully received when every line's cumulative invoiced ≥ ordered.
    for (const ii of invoiceItems) { const k = `${ii.product_id}:${ii.sku}`; invoicedByKey[k] = (invoicedByKey[k] || 0) + ii.quantity }
    const fully = (poItems || []).every(pi => (invoicedByKey[`${pi.product_id}:${pi.sku}`] || 0) >= pi.quantity)
    const poStatus = fully ? 'CONFIRMED' : 'PARTIALLY_RECEIVED'
    await supabase.from('orders').update({ status: poStatus }).eq('id', poId)

    return NextResponse.json({ invoice, po_status: poStatus }, { status: 201 })
  } catch (err) {
    console.error('[console/purchases/[id]/convert] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
