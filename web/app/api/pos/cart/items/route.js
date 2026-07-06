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

// Available stock for a cart line, matching the values surfaced as
// `available_stock`/`batch.available_qty` elsewhere in the POS:
//   • batch line   → product_batches.quantity for that batch
//   • package line → package_available_qty(package_id) (floored component stock)
//   • plain product → products.current_stock
// Returns a number when stock is tracked, or null when it isn't (no clamp).
async function availableStockFor(supabase, { productId, batchId, packageId }) {
  if (batchId) {
    const { data } = await supabase
      .from('product_batches')
      .select('quantity')
      .eq('id', batchId)
      .single()
    return data?.quantity ?? null
  }

  if (packageId) {
    const { data, error } = await supabase.rpc('package_available_qty', { p_package_id: packageId })
    if (error) return null
    return typeof data === 'number' ? data : null
  }

  if (productId) {
    const { data } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', productId)
      .single()
    return data?.current_stock ?? null
  }

  return null
}

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const body = await request.json()
  const action = body.action

  // Add item
  if (action === 'add' || !action) {
    const { cartId, product } = body
    const unitPrice = parseFloat(product.unitPrice ?? product.selling_price ?? product.mrp ?? product.wholesale_price ?? 0)
    const batchId   = product.batch_id ?? null
    const packageId = product.package_def_id ?? null

    // Dedup check handled by the hook — just insert. A new line is always qty 1,
    // so there's nothing to cap on add: a fully-out-of-stock product (tracked 0)
    // is still added as 1 and caught by the checkout stock gate, same as before.
    // Real over-stock entry comes through update_qty, which is clamped below.
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
        salesperson_id: product.salesperson_id ?? null,
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
    // Get current item for price calc + stock source (product/batch/package)
    const { data: item } = await supabase
      .from('cart_items')
      .select('unit_price, discount, product_id, batch_id, package_id')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    // Hard cap: a line can never carry more than the available stock. Untracked
    // stock (null) is unaffected. Floor at 1 — dropping to zero is a remove.
    const available = await availableStockFor(supabase, {
      productId: item.product_id,
      batchId:   item.batch_id,
      packageId: item.package_id,
    })
    const stockCapped = available != null && quantity > available
    const finalQty    = stockCapped ? Math.max(1, available) : quantity

    const unitPrice = parseFloat(item.unit_price)
    const discount  = parseFloat(item.discount ?? 0)
    const taxable   = Math.max(0, unitPrice - discount)
    const gst5    = parseFloat((taxable * 0.05 * finalQty).toFixed(2))
    const total   = parseFloat(((taxable * 1.05) * finalQty).toFixed(2))

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: finalQty, gst_5: gst5, total })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data, stockCapped, available: stockCapped ? available : null })
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

  // Assign / clear a single line's salesperson (per-line attribution #3).
  if (action === 'set_salesperson') {
    const { itemId, salespersonId } = body
    const { data, error } = await supabase
      .from('cart_items')
      .update({ salesperson_id: salespersonId ?? null })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
