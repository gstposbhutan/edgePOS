import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const ITEM_SELECT = `
  *,
  batch:batch_id (id, batch_number, expires_at, mrp, selling_price, available_qty:quantity),
  package_def:package_id (
    id, package_type,
    package_items (quantity, product:product_id (name, unit))
  )
`

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const body = await request.json()
  const action = body.action

  // Add item
  if (action === 'add' || !action) {
    const { cartId, product } = body
    const unitPrice = parseFloat(product.selling_price ?? product.mrp ?? product.wholesale_price ?? 0)
    const batchId   = product.batch_id ?? null
    const packageId = product.package_def_id ?? null

    // Dedup check handled by the hook — just insert
    const taxable = Math.max(0, unitPrice - 0)
    const gst5  = parseFloat((taxable * 0.05 * 1).toFixed(2))
    const total = parseFloat(((taxable * 1.05) * 1).toFixed(2))

    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        cart_id:    cartId,
        product_id: product.id,
        package_id: packageId,
        batch_id:   batchId,
        name:       product.name,
        sku:        product.sku ?? null,
        quantity:   1,
        unit_price: unitPrice,
        discount:   0,
        gst_5:      gst5,
        total,
      })
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }

  // Update quantity
  if (action === 'update_qty') {
    const { itemId, quantity } = body
    // Get current item for price calc
    const { data: item } = await supabase
      .from('cart_items')
      .select('unit_price, discount')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const unitPrice = parseFloat(item.unit_price)
    const discount  = parseFloat(item.discount ?? 0)
    const taxable   = Math.max(0, unitPrice - discount)
    const gst5    = parseFloat((taxable * 0.05 * quantity).toFixed(2))
    const total   = parseFloat(((taxable * 1.05) * quantity).toFixed(2))

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity, gst_5: gst5, total })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }

  // Apply discount
  if (action === 'discount') {
    const { itemId, discount, discountType, discountValue } = body

    const { data: item } = await supabase
      .from('cart_items')
      .select('unit_price, quantity')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const unitPrice = parseFloat(item.unit_price)
    const qty       = item.quantity
    const taxable   = Math.max(0, unitPrice - discount)
    const gst5    = parseFloat((taxable * 0.05 * qty).toFixed(2))
    const total   = parseFloat(((taxable * 1.05) * qty).toFixed(2))

    const updateFields = { discount, gst_5: gst5, total }
    if (discountType)  updateFields.discount_type  = discountType
    if (discountValue !== undefined) updateFields.discount_value = discountValue

    const { data, error } = await supabase
      .from('cart_items')
      .update(updateFields)
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) {
      // Fallback without discount_type/discount_value
      const { data: fallback, error: fbError } = await supabase
        .from('cart_items')
        .update({ discount, gst_5: gst5, total })
        .eq('id', itemId)
        .select(ITEM_SELECT)
        .single()

      if (fbError) return NextResponse.json({ error: fbError.message }, { status: 500 })
      if (discountType) fallback.discount_type = discountType
      if (discountValue !== undefined) fallback.discount_value = discountValue
      return NextResponse.json({ item: fallback })
    }

    return NextResponse.json({ item: data })
  }

  // Remove item
  if (action === 'remove') {
    const { itemId } = body
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Override price
  if (action === 'override_price') {
    const { itemId, unitPrice: newPrice } = body
    const { data: item } = await supabase
      .from('cart_items')
      .select('discount, quantity')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const price    = Math.max(0, parseFloat(newPrice))
    const discount = parseFloat(item.discount ?? 0)
    const qty      = item.quantity
    const taxable  = Math.max(0, price - discount)
    const gst5   = parseFloat((taxable * 0.05 * qty).toFixed(2))
    const total  = parseFloat(((taxable * 1.05) * qty).toFixed(2))

    const { data, error } = await supabase
      .from('cart_items')
      .update({ unit_price: price, gst_5: gst5, total })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
