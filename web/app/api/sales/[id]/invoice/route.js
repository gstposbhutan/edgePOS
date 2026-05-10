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

    const { id: soId } = await params
    const serviceClient = createServiceClient()

    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })
    const vendorEntityId = profile.entity_id

    // Fetch the Sales Order
    const { data: so } = await serviceClient
      .from('orders')
      .select('*, seller:entities!seller_id(id, name, tpn_gstin, whatsapp_no)')
      .eq('id', soId)
      .eq('order_type', 'SALES_ORDER')
      .single()

    if (!so) return NextResponse.json({ error: 'Sales Order not found' }, { status: 404 })
    if (so.seller_id !== vendorEntityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (so.status === 'CANCELLED') return NextResponse.json({ error: 'Cannot invoice a cancelled order' }, { status: 400 })
    if (so.status === 'CONFIRMED') return NextResponse.json({ error: 'Sales Order is already fully invoiced' }, { status: 400 })

    const body = await request.json()
    const { items, payment_method, invoice_ref } = body

    if (!items?.length) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })

    // Fetch SO line items
    const { data: soItems } = await serviceClient
      .from('order_items')
      .select('*')
      .eq('order_id', soId)
    const soItemMap = Object.fromEntries((soItems || []).map(i => [i.id, i]))

    // Calculate already-invoiced quantities across existing non-cancelled invoices
    const existingInvoiceIds = await serviceClient
      .from('orders')
      .select('id')
      .eq('sales_order_id', soId)
      .in('order_type', ['SALES_INVOICE'])
      .not('status', 'eq', 'CANCELLED')
      .then(r => (r.data || []).map(o => o.id))

    const alreadyInvoicedMap = {}
    if (existingInvoiceIds.length > 0) {
      const { data: existingItems } = await serviceClient
        .from('order_items')
        .select('product_id, sku, quantity')
        .in('order_id', existingInvoiceIds)
      for (const ei of (existingItems || [])) {
        const key = `${ei.product_id}:${ei.sku}`
        alreadyInvoicedMap[key] = (alreadyInvoicedMap[key] || 0) + ei.quantity
      }
    }

    // Build invoice items with sub-batch support
    const invoiceItems = []
    let subtotal = 0

    for (const line of items) {
      const soItem = soItemMap[line.order_item_id]
      if (!soItem) return NextResponse.json({ error: `Order item ${line.order_item_id} not found` }, { status: 404 })

      const subBatches = line.sub_batches?.length
        ? line.sub_batches
        : [{ quantity: line.quantity || soItem.quantity, batch_id: line.batch_id || soItem.batch_id, batch_number: line.batch_number, unit_price: line.unit_price }]

      const totalQty = subBatches.reduce((s, sb) => s + (parseInt(sb.quantity || 0, 10)), 0)
      const key = `${soItem.product_id}:${soItem.sku}`
      const alreadyInvoiced = alreadyInvoicedMap[key] || 0
      const remaining = soItem.quantity - alreadyInvoiced

      if (totalQty <= 0) return NextResponse.json({ error: `Quantity must be > 0 for "${soItem.name}"` }, { status: 400 })
      if (totalQty > remaining) {
        return NextResponse.json({
          error: `Over-invoice for "${soItem.name}": ordered ${soItem.quantity}, already invoiced ${alreadyInvoiced}, remaining ${remaining} — cannot invoice ${totalQty}`
        }, { status: 400 })
      }

      for (const sb of subBatches) {
        const qty       = parseInt(sb.quantity || 1, 10)
        const unitPrice = parseFloat(sb.unit_price ?? soItem.unit_price ?? 0)
        const gst5      = parseFloat((unitPrice * qty * 0.05).toFixed(2))
        const total     = parseFloat((unitPrice * qty * 1.05).toFixed(2))
        subtotal       += unitPrice * qty

        invoiceItems.push({
          product_id:   soItem.product_id,
          sku:          soItem.sku,
          name:         soItem.name,
          quantity:     qty,
          unit_price:   unitPrice,
          discount:     0,
          gst_5:        gst5,
          total,
          status:       'ACTIVE',
          batch_id:     sb.batch_id     || null,
          batch_number: sb.batch_number || null,
        })
      }
    }

    const gstTotal   = parseFloat((subtotal * 0.05).toFixed(2))
    const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

    // Generate SI number: SI-YYYY-XXXXX
    const year = new Date().getFullYear()
    const { data: lastInvoice } = await serviceClient
      .from('orders')
      .select('order_no')
      .like('order_no', `SI-${year}-%`)
      .order('order_no', { ascending: false })
      .limit(1)
      .single()

    const lastSerial = lastInvoice?.order_no ? parseInt(lastInvoice.order_no.split('-')[2] || '0', 10) : 0
    const invoiceNo = `SI-${year}-${String(lastSerial + 1).padStart(5, '0')}`

    // Digital signature
    const { createHash } = await import('node:crypto')
    const signature = createHash('sha256')
      .update(`${invoiceNo}:${grandTotal}:${so.seller?.tpn_gstin ?? ''}`)
      .digest('hex')

    // Create SALES_INVOICE — status CONFIRMED triggers deduct_stock_on_sales_invoice
    const { data: invoice, error: invErr } = await serviceClient
      .from('orders')
      .insert({
        order_type:        'SALES_INVOICE',
        order_no:          invoiceNo,
        status:            'CONFIRMED',
        seller_id:         vendorEntityId,
        buyer_id:          so.buyer_id,
        buyer_whatsapp:    so.buyer_whatsapp,
        sales_order_id:    soId,
        invoice_ref:       invoice_ref?.trim() || null,
        payment_method:    payment_method || so.payment_method,
        items:             invoiceItems,
        subtotal:          parseFloat(subtotal.toFixed(2)),
        gst_total:         gstTotal,
        grand_total:       grandTotal,
        digital_signature: signature,
        created_by:        session.user.id,
      })
      .select('id, order_no, status, subtotal, gst_total, grand_total, payment_method, buyer_whatsapp, invoice_ref, sales_order_id, created_at')
      .single()

    if (invErr) throw invErr

    await serviceClient.from('order_items').insert(
      invoiceItems.map(item => ({ order_id: invoice.id, ...item }))
    )

    // Update SO status
    const allSoItems = soItems || []
    const newInvoicedByKey = {}
    for (const ii of invoiceItems) {
      const key = `${ii.product_id}:${ii.sku}`
      newInvoicedByKey[key] = (newInvoicedByKey[key] || 0) + ii.quantity
    }

    let allFullyInvoiced = true
    for (const soItem of allSoItems) {
      const key = `${soItem.product_id}:${soItem.sku}`
      const prev = alreadyInvoicedMap[key] || 0
      const newQty = newInvoicedByKey[key] || 0
      if (prev + newQty < soItem.quantity) { allFullyInvoiced = false; break }
    }

    await serviceClient
      .from('orders')
      .update({ status: allFullyInvoiced ? 'CONFIRMED' : 'PARTIALLY_FULFILLED' })
      .eq('id', soId)

    // Handle CREDIT: khata debit for customer
    if ((payment_method || so.payment_method) === 'CREDIT' && so.buyer_whatsapp) {
      const { data: existingKhata } = await serviceClient
        .from('khata_accounts')
        .select('id, outstanding_balance')
        .eq('creditor_entity_id', vendorEntityId)
        .eq('debtor_phone', so.buyer_whatsapp)
        .eq('party_type', 'CONSUMER')
        .single()

      let khataId = existingKhata?.id
      if (!khataId) {
        const { data: newKhata } = await serviceClient
          .from('khata_accounts')
          .insert({
            creditor_entity_id: vendorEntityId,
            party_type:         'CONSUMER',
            debtor_phone:       so.buyer_whatsapp,
            credit_limit:       1000,
          })
          .select('id')
          .single()
        khataId = newKhata?.id
      }

      if (khataId) {
        await serviceClient
          .from('khata_accounts')
          .update({ outstanding_balance: (parseFloat(existingKhata?.outstanding_balance || 0) + grandTotal).toFixed(2) })
          .eq('id', khataId)

        await serviceClient.from('khata_transactions').insert({
          khata_account_id: khataId,
          order_id:         invoice.id,
          transaction_type: 'DEBIT',
          amount:           grandTotal,
          balance_after:    (parseFloat(existingKhata?.outstanding_balance || 0) + grandTotal).toFixed(2),
          notes:            'Sales Invoice: ' + invoiceNo,
          created_by:       session.user.id,
        })
      }
    }

    return NextResponse.json({
      invoice: { ...invoice, items: invoiceItems },
      so_status: allFullyInvoiced ? 'CONFIRMED' : 'PARTIALLY_FULFILLED',
    })

  } catch (error) {
    console.error('[sales/[id]/invoice]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
