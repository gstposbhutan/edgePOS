import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    orderNo, items, subtotal, gstTotal, grandTotal,
    paymentMethod, paymentRef, customerWhatsapp, buyerHash,
    cartId, digitalSignature,
  } = body

  const supabase = ctx.supabase

  // Insert order at PENDING_PAYMENT
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_type:     'POS_SALE',
      order_no:       orderNo,
      status:         'PENDING_PAYMENT',
      seller_id:      ctx.entityId,
      buyer_whatsapp: customerWhatsapp ?? null,
      buyer_hash:     buyerHash ?? null,
      items,
      subtotal,
      gst_total:      gstTotal,
      grand_total:    grandTotal,
      payment_method: paymentMethod,
      payment_ref:    paymentRef ?? null,
      digital_signature: digitalSignature ?? null,
      cart_id:        cartId ?? null,
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

  // Track shift transaction (fire-and-forget, non-blocking)
  fetch(new URL('/api/shifts/track-transaction', request.url).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: order.id,
      transaction_type: 'SALE',
      payment_method: paymentMethod,
      amount: grandTotal,
    }),
  }).catch(() => {})

  return NextResponse.json({ order })
}
