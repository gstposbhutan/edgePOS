import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request, { params }) {
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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: poId } = await params
    const serviceClient = createServiceClient()

    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })
    const vendorEntityId = profile.entity_id

    // Fetch the original PO
    const { data: po } = await serviceClient
      .from('orders')
      .select('*')
      .eq('id', poId)
      .eq('order_type', 'PURCHASE_ORDER')
      .single()

    if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    if (po.buyer_id !== vendorEntityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (po.status === 'CANCELLED') return NextResponse.json({ error: 'Cannot convert a cancelled PO' }, { status: 400 })

    const body = await request.json()
    const { items, payment_method, supplier_ref } = body

    if (!items?.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })

    // Fetch original PO items for reference
    const { data: poItems } = await serviceClient
      .from('order_items')
      .select('*')
      .eq('order_id', poId)

    const poItemMap = Object.fromEntries((poItems || []).map(i => [i.id, i]))

    // Calculate already-invoiced quantities per PO line item across all existing invoices
    // (both DRAFT and CONFIRMED invoices count — we don't want to double-receive)
    const { data: existingInvoiceItems } = await serviceClient
      .from('order_items')
      .select('id, quantity, oi_src:orders!order_id(id, purchase_order_id, status, order_type)')
      .in(
        'order_id',
        (await serviceClient
          .from('orders')
          .select('id')
          .eq('purchase_order_id', poId)
          .in('order_type', ['PURCHASE_INVOICE'])
          .not('status', 'eq', 'CANCELLED')
          .then(r => (r.data || []).map(o => o.id))
        )
      )

    // Build a map: poItemId → total already invoiced qty
    // We match by product_id + sku since invoice items are copies of PO items
    const alreadyInvoicedByProductSku = {}
    for (const ei of (existingInvoiceItems || [])) {
      const key = `${ei.product_id}:${ei.sku}`
      alreadyInvoicedByProductSku[key] = (alreadyInvoicedByProductSku[key] || 0) + ei.quantity
    }

    // Simpler approach: sum invoice quantities by matching original PO item
    // Since invoice items have the same product_id+sku, aggregate by product+sku
    const poItemAlreadyInvoiced = {}
    for (const poItem of (poItems || [])) {
      const key = `${poItem.product_id}:${poItem.sku}`
      poItemAlreadyInvoiced[poItem.id] = alreadyInvoicedByProductSku[key] || 0
    }

    // Build invoice items from the convert payload
    const invoiceItems = []
    let subtotal = 0

    for (const line of items) {
      const poItem = poItemMap[line.order_item_id]
      if (!poItem) return NextResponse.json({ error: `PO item ${line.order_item_id} not found` }, { status: 404 })

      // Support sub_batches (multiple batches per PO line) or legacy single-batch fields
      const subBatches = line.sub_batches?.length
        ? line.sub_batches
        : [{
            quantity:        line.quantity_received || poItem.quantity,
            unit_cost:       line.unit_cost         ?? poItem.unit_cost ?? poItem.unit_price,
            mrp:             line.mrp,
            selling_price:   line.selling_price,
            batch_number:    line.batch_number    || null,
            batch_barcode:   line.batch_barcode   || null,
            expires_at:      line.expires_at      || null,
            manufactured_at: line.manufactured_at || null,
          }]

      // Validate: total for this invoice must not exceed remaining (PO qty − already invoiced)
      const totalReceived   = subBatches.reduce((sum, sb) => sum + (parseInt(sb.quantity || 0, 10)), 0)
      const alreadyInvoiced = poItemAlreadyInvoiced[line.order_item_id] || 0
      const remaining       = poItem.quantity - alreadyInvoiced

      if (totalReceived <= 0) {
        return NextResponse.json({
          error: `Quantity must be greater than 0 for "${poItem.name}"`
        }, { status: 400 })
      }
      if (totalReceived > remaining) {
        return NextResponse.json({
          error: `Over-invoice for "${poItem.name}": PO ordered ${poItem.quantity}, already invoiced ${alreadyInvoiced}, remaining ${remaining} — cannot invoice ${totalReceived} units.`
        }, { status: 400 })
      }

      for (const sb of subBatches) {
        const qty = parseInt(sb.quantity || 0, 10)
        if (qty < 1) {
          return NextResponse.json({
            error: `Each batch quantity must be at least 1 (found 0 for "${poItem.name}")`
          }, { status: 400 })
        }
        const unitCost = parseFloat(sb.unit_cost ?? poItem.unit_cost ?? poItem.unit_price ?? 0)
        const total    = unitCost * qty
        subtotal      += total

        invoiceItems.push({
          product_id:      poItem.product_id,
          sku:             poItem.sku,
          name:            poItem.name,
          quantity:        qty,
          unit_price:      unitCost,
          unit_cost:       unitCost,
          discount:        0,
          gst_5:           0,
          total,
          status:          'ACTIVE',
          batch_number:    sb.batch_number    || null,
          batch_barcode:   sb.batch_barcode   || null,
          expires_at:      sb.expires_at      || null,
          manufactured_at: sb.manufactured_at || null,
        })
      }
    }

    const grandTotal = parseFloat(subtotal.toFixed(2))

    // Generate PI number: PI-YYYY-XXXXX
    const year = new Date().getFullYear()
    const { data: lastInvoice } = await serviceClient
      .from('orders')
      .select('order_no')
      .like('order_no', `PI-${year}-%`)
      .order('order_no', { ascending: false })
      .limit(1)
      .single()

    const lastSerial = lastInvoice?.order_no ? parseInt(lastInvoice.order_no.split('-')[2] || '0', 10) : 0
    const invoiceNo = `PI-${year}-${String(lastSerial + 1).padStart(5, '0')}`

    // Create the Purchase Invoice
    const { data: invoice, error: invErr } = await serviceClient
      .from('orders')
      .insert({
        order_type:        'PURCHASE_INVOICE',
        order_no:          invoiceNo,
        status:            'DRAFT',
        seller_id:         po.seller_id,
        buyer_id:          vendorEntityId,
        purchase_order_id: poId,
        supplier_name:     po.supplier_name,
        supplier_ref:      supplier_ref?.trim() || po.supplier_ref,
        payment_method:    payment_method || po.payment_method,
        items:             invoiceItems,
        subtotal:          grandTotal,
        gst_total:         0,
        grand_total:       grandTotal,
        created_by:        session.user.id,
      })
      .select('id, order_no, status, grand_total')
      .single()

    if (invErr) throw invErr

    // Insert invoice order_items
    await serviceClient.from('order_items').insert(
      invoiceItems.map(item => ({ order_id: invoice.id, ...item }))
    )

    // Update PO status based on total invoiced quantities after this invoice
    // Calculate total invoiced per PO line (existing + this new invoice)
    const newInvoicedByProductSku = {}
    for (const ii of invoiceItems) {
      const key = `${ii.product_id}:${ii.sku}`
      newInvoicedByProductSku[key] = (newInvoicedByProductSku[key] || 0) + ii.quantity
    }

    let allFullyInvoiced = true
    for (const poItem of (poItems || [])) {
      const key = `${poItem.product_id}:${poItem.sku}`
      const prevInvoiced = alreadyInvoicedByProductSku[key] || 0
      const newInvoiced  = newInvoicedByProductSku[key]   || 0
      const totalNow     = prevInvoiced + newInvoiced
      if (totalNow < poItem.quantity) {
        allFullyInvoiced = false
        break
      }
    }

    const newPoStatus = allFullyInvoiced ? 'CONFIRMED' : 'PARTIALLY_RECEIVED'
    await serviceClient
      .from('orders')
      .update({ status: newPoStatus })
      .eq('id', poId)

    return NextResponse.json({ invoice, po_status: newPoStatus })

  } catch (error) {
    console.error('[purchases/[id]/convert]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
