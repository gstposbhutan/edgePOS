import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const CART_SELECT = `
  id, customer_whatsapp, buyer_hash, bill_discount, created_at,
  cart_items (
    *,
    batch:batch_id (id, batch_number, expires_at, mrp, selling_price, available_qty:quantity),
    package_def:package_id (
      id, package_type,
      package_items (
        quantity,
        product:product_id (name, unit)
      )
    )
  )
`

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const { data: existing, error } = await supabase
    .from('carts')
    .select(CART_SELECT)
    .eq('entity_id', ctx.entityId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const carts = (existing ?? []).map(c => ({
    ...c,
    customer_whatsapp: null,
    buyer_hash: null,
    cart_items: c.cart_items ?? [],
  }))

  // If no carts, create one
  if (carts.length === 0) {
    const { data: newCart, error: createError } = await supabase
      .from('carts')
      .insert({ entity_id: ctx.entityId, created_by: ctx.userId, status: 'ACTIVE' })
      .select(CART_SELECT)
      .single()

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
    return NextResponse.json({ carts: [{ ...newCart, customer_whatsapp: null, buyer_hash: null, cart_items: newCart.cart_items ?? [] }] })
  }

  return NextResponse.json({ carts })
}

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const action = body.action

  const supabase = ctx.supabase

  // Create new cart
  if (action === 'create' || !action) {
    const { data, error } = await supabase
      .from('carts')
      .insert({ entity_id: ctx.entityId, created_by: ctx.userId, status: 'ACTIVE' })
      .select(CART_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ cart: { ...data, customer_whatsapp: null, buyer_hash: null, cart_items: data.cart_items ?? [] } })
  }

  // Set customer identity
  if (action === 'set_customer') {
    const { cartId, whatsapp, buyerHash } = body
    const { error } = await supabase
      .from('carts')
      .update({ customer_whatsapp: whatsapp, buyer_hash: buyerHash })
      .eq('id', cartId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Clear cart (delete items, mark CONVERTED, create fresh)
  if (action === 'clear') {
    const { cartId } = body
    await supabase.from('cart_items').delete().eq('cart_id', cartId)
    await supabase.from('carts').update({ status: 'CONVERTED' }).eq('id', cartId)

    const { data: newCart, error } = await supabase
      .from('carts')
      .insert({ entity_id: ctx.entityId, created_by: ctx.userId, status: 'ACTIVE' })
      .select(CART_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ cart: { ...newCart, customer_whatsapp: null, buyer_hash: null, cart_items: newCart.cart_items ?? [] } })
  }

  // Set the invoice/bill-level discount (pre-GST, applied to the net subtotal — NOT distributed
  // across line items). A single amount stored on the cart, snapshotted onto the order at checkout.
  if (action === 'set_bill_discount') {
    const { cartId } = body
    const billDiscount = Math.max(0, parseFloat(body.billDiscount ?? 0) || 0)
    const { error } = await supabase
      .from('carts')
      .update({ bill_discount: billDiscount })
      .eq('id', cartId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, bill_discount: billDiscount })
  }

  // Abandon cart
  if (action === 'abandon') {
    const { cartId } = body
    await supabase.from('cart_items').delete().eq('cart_id', cartId)
    await supabase.from('carts').update({ status: 'ABANDONED' }).eq('id', cartId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
