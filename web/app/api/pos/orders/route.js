import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getAuthContext } from '@/lib/supabase/server'

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    items, subtotal, gstTotal, grandTotal, billDiscount,
    paymentMethod, paymentChannel, paymentRef, customerWhatsapp, buyerHash,
    cartId, invoiceDate,
    salespersonId, quotation, isQuotation, deliveryAddress,
  } = body

  const supabase = ctx.supabase

  // Phase 2: admin-only invoice date override. Non-admins cannot back/forward-date;
  // otherwise the column defaults to now() (resolved at insert below). The override
  // is self-auditing: invoice_date diverging from created_at is the trail.
  const isAdmin = ['OWNER', 'ADMIN'].includes(ctx.subRole)
  let invoiceDateForInsert   // undefined → column DEFAULT now()
  if (invoiceDate !== undefined && invoiceDate !== null && invoiceDate !== '') {
    if (!isAdmin) return NextResponse.json({ error: 'Date override is admin-only' }, { status: 403 })
    const parsed = new Date(invoiceDate)
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: 'Invalid invoice date' }, { status: 400 })
    invoiceDateForInsert = parsed.toISOString()
  }

  // P1-2: the order number and digital signature are issued server-side and are
  // never trusted from the client. Prefix + signature inputs come from the seller
  // entity, and the number is allocated by an atomic per-seller/per-year counter.
  const { data: entity } = await supabase
    .from('entities')
    .select('name, tpn_gstin')
    .eq('id', ctx.entityId)
    .single()

  const { data: orderNo, error: orderNoError } = await supabase
    .rpc('next_pos_order_no', { p_seller_id: ctx.entityId, p_prefix: entity?.name ?? 'POS' })
  if (orderNoError || !orderNo) {
    return NextResponse.json({ error: orderNoError?.message || 'Failed to generate order number' }, { status: 500 })
  }

  const digitalSignature = createHash('sha256')
    .update(`${orderNo}:${grandTotal}:${entity?.tpn_gstin ?? ''}`)
    .digest('hex')

  // Sell-side draft (Alt+Q): a DRAFT SALES_ORDER — either a committed Sales Order or a
  // non-binding Quotation (is_quotation). No payment and no stock move — stock is only
  // deducted when it's fulfilled into a Sales Invoice, which we skip here.
  if (quotation) {
    const { data: quote, error: quoteError } = await supabase
      .from('orders')
      .insert({
        order_type:     'SALES_ORDER',
        order_no:       orderNo,
        status:         'DRAFT',
        is_quotation:   !!isQuotation,
        seller_id:      ctx.entityId,
        buyer_whatsapp: customerWhatsapp ?? null,
        buyer_hash:     buyerHash ?? null,
        items,
        subtotal,
        gst_total:      gstTotal,
        grand_total:    grandTotal,
        bill_discount:  billDiscount ?? 0,
        digital_signature: digitalSignature,
        cart_id:        cartId ?? null,
        salesperson_id: salespersonId ?? null,
        delivery_address: deliveryAddress ?? null,
        created_by:     ctx.userId,
      })
      .select('id, order_no')
      .single()
    if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 500 })

    const { error: qItemsError } = await supabase.from('order_items').insert(
      items.map(item => ({
        order_id:   quote.id,
        product_id: item.product_id,
        batch_id:   item.batch_id ?? null,
        sku:        item.sku,
        name:       item.name,
        quantity:   item.quantity,
        unit_price: item.unit_price,
        discount:       item.discount ?? 0,
        discount_type:  item.discount_type || 'FLAT',
        discount_value: item.discount_value ?? 0,
        gst_5:      item.gst_5,
        total:      item.total,
        status:     'ACTIVE',
      }))
    )
    if (qItemsError) return NextResponse.json({ error: qItemsError.message }, { status: 500 })
    return NextResponse.json({ order: quote })
  }

  // Which register/terminal rang this sale: the most-recent ACTIVE shift for the
  // entity. (Proper multi-register web attribution would need the client to pass
  // the active shift/register id; most-recent is the server-side best-effort.)
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, register_id')
    .eq('entity_id', ctx.entityId)
    .eq('status', 'ACTIVE')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Insert order at PENDING_PAYMENT
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_type:     'POS_SALE',
      order_no:       orderNo,
      status:         'PENDING_PAYMENT',
      seller_id:      ctx.entityId,
      register_id:    shift?.register_id ?? null,
      buyer_whatsapp: customerWhatsapp ?? null,
      buyer_hash:     buyerHash ?? null,
      items,
      subtotal,
      gst_total:      gstTotal,
      grand_total:    grandTotal,
      bill_discount:  billDiscount ?? 0,
      payment_method:  paymentMethod,
      payment_channel: paymentChannel ?? null,
      payment_ref:     paymentRef ?? null,
      digital_signature: digitalSignature,
      cart_id:        cartId ?? null,
      invoice_date:   invoiceDateForInsert,   // undefined → column DEFAULT now()
      salesperson_id: salespersonId ?? null,
      delivery_address: deliveryAddress ?? null,
      created_by:     ctx.userId,
    })
    .select('id, order_no')
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  // Insert order_items
  const { error: itemsError } = await supabase.from('order_items').insert(
    items.map(item => ({
      order_id:   order.id,
      product_id: item.product_id,
      batch_id:   item.batch_id ?? null,
      sku:        item.sku,
      name:       item.name,
      quantity:   item.quantity,
      unit_price: item.unit_price,
      salesperson_id: item.salesperson_id ?? salespersonId ?? null,
      discount:       item.discount ?? 0,
      discount_type:  item.discount_type || 'FLAT',
      discount_value: item.discount_value ?? 0,
      gst_5:      item.gst_5,
      total:      item.total,
      status:     'ACTIVE',
    }))
  )

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  // Confirm order — triggers stock deduction
  const { error: confirmError } = await supabase
    .from('orders')
    .update({ status: 'CONFIRMED', payment_verified_at: new Date().toISOString() })
    .eq('id', order.id)

  if (confirmError) return NextResponse.json({ error: confirmError.message }, { status: 500 })

  // Link the sale to its shift IN-HANDLER. The previous server→server fetch to
  // /api/shifts/track-transaction dropped the auth cookie and silently failed, so
  // no sale was ever recorded against a shift. Insert directly with the authed client.
  if (shift) {
    const { error: trackError } = await supabase.from('shift_transactions').insert({
      shift_id: shift.id,
      order_id: order.id,
      transaction_type: 'SALE',
      payment_method: paymentMethod,
      amount: grandTotal,
    })
    if (trackError) console.error('shift_transactions insert failed:', trackError.message)
  }

  return NextResponse.json({ order })
}
