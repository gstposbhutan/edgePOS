import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { calcItemTotals } from '@/lib/gst'
import { lineFactor } from '@/lib/pos/units'

/**
 * A line's money, in ONE place, so every action agrees with every other and with the ticket's
 * GST basis (migration 138). `taxablePerUnit` is already net of the line discount.
 *
 * `gstIncluded` (Alt+T) means the rate the cashier typed ALREADY contains the 5%, so it is
 * extracted rather than added and the customer pays exactly the rate shown. Exempt goods carry
 * no GST either way, so the basis cannot change them.
 */
function lineMoney(taxablePerUnit, quantity, exempt, gstIncluded) {
  const { gstAmount, total } = calcItemTotals(
    { unitPrice: taxablePerUnit, discount: 0, quantity, gstExempt: exempt },
    gstIncluded,
  )
  return { gst5: gstAmount, total }
}

/** The basis this ticket is being rung on. Reached from the cart, never trusted from the client. */
async function gstBasisFor(supabase, { cartId, itemId }) {
  if (cartId) {
    const { data } = await supabase.from('carts').select('gst_included').eq('id', cartId).maybeSingle()
    return !!data?.gst_included
  }
  const { data } = await supabase.from('cart_items').select('carts(gst_included)').eq('id', itemId).maybeSingle()
  const cart = Array.isArray(data?.carts) ? data.carts[0] : data?.carts
  return !!cart?.gst_included
}

// The line, plus the item-master facts the till has to read on every keystroke: whether the
// line is GST-exempt (tax is never client-trusted, so it is resolved here and only DISPLAYED
// there) and the Pcs/Pack/Case ladder behind Alt+U. Joined rather than copied onto the line —
// a second copy is a second thing that can go stale when the shop edits the product.
const ITEM_SELECT = `
  *,
  product:product_id (
    id, gst_exempt, sold_by_weight, unit, current_stock, barcode, mrp,
    pack_size, case_size, pack_label, case_label
  ),
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

    // Weighed goods pass a fractional quantity (the measured weight in the product's unit);
    // discrete items default to 1 (further adds increment via update_qty).
    const qty = Math.max(0.001, parseFloat(product.quantity ?? 1) || 1)
    const taxable = Math.max(0, unitPrice - 0)
    // Resolve the exempt flag from the DB, not the client (tax must not be client-trusted).
    let exempt = !!product.gst_exempt
    if (product.id) {
      const { data: pr } = await supabase.from('products').select('gst_exempt').eq('id', product.id).maybeSingle()
      if (pr) exempt = !!pr.gst_exempt
    }
    const { gst5, total } = lineMoney(taxable, qty, exempt, await gstBasisFor(supabase, { cartId }))

    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        cart_id:    cartId,
        product_id: product.id,
        package_id: packageId,
        batch_id:   batchId,
        name:       product.name,
        sku:        product.sku ?? null,
        quantity:   qty,
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
      .select('unit_price, discount, product_id, batch_id, package_id, unit_factor, products(gst_exempt)')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    // Hard cap: a line can never carry more than the available stock. Untracked
    // stock (null) is unaffected. Floor at 1 — dropping to zero is a remove.
    //
    // Stock is held in PIECES, so a line rung in packs or cases converts before comparing —
    // and the cap it reports back is in the SOLD unit, which is what the cashier is typing.
    // Floor, never round: 11 pieces is zero full cartons of 12.
    const factor    = lineFactor(item)
    const pieces    = await availableStockFor(supabase, {
      productId: item.product_id,
      batchId:   item.batch_id,
      packageId: item.package_id,
    })
    const available   = pieces == null ? null : Math.floor(pieces / factor)
    const stockCapped = available != null && quantity > available
    const finalQty    = stockCapped ? Math.max(1, available) : quantity

    const unitPrice = parseFloat(item.unit_price)
    const discount  = parseFloat(item.discount ?? 0)
    const taxable   = Math.max(0, unitPrice - discount)
    const exempt    = !!(Array.isArray(item.products) ? item.products[0] : item.products)?.gst_exempt
    const { gst5, total } = lineMoney(taxable, finalQty, exempt, await gstBasisFor(supabase, { itemId }))

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: finalQty, gst_5: gst5, total })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data, stockCapped, available: stockCapped ? available : null })
  }

  // Change which batch a line draws from (explicit FEFO/FIFO override). Re-prices to the chosen
  // batch's selling price (batch pricing — old stock sells at its old price) and caps qty to it.
  if (action === 'change_batch') {
    const { itemId, batchId } = body
    const { data: item } = await supabase
      .from('cart_items')
      .select('discount, quantity, product_id, products(gst_exempt, selling_price, mrp)')
      .eq('id', itemId)
      .single()
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const { data: batch } = await supabase
      .from('product_batches')
      .select('id, quantity, selling_price')
      .eq('id', batchId)
      .eq('product_id', item.product_id)
      .eq('entity_id', ctx.entityId)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    if (!batch) return NextResponse.json({ error: 'That batch is not available' }, { status: 400 })

    const prod = Array.isArray(item.products) ? item.products[0] : item.products
    const newPrice = parseFloat(batch.selling_price ?? prod?.selling_price ?? prod?.mrp ?? 0)
    const available = batch.quantity == null ? null : Number(batch.quantity)
    const stockCapped = available != null && item.quantity > available
    const finalQty = stockCapped ? Math.max(1, available) : item.quantity

    const discount = parseFloat(item.discount ?? 0)
    const taxable  = Math.max(0, newPrice - discount)
    const exempt   = !!prod?.gst_exempt
    const { gst5, total } = lineMoney(taxable, finalQty, exempt, await gstBasisFor(supabase, { itemId }))

    const { data, error } = await supabase
      .from('cart_items')
      .update({ batch_id: batchId, unit_price: newPrice, quantity: finalQty, gst_5: gst5, total })
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
      .select('unit_price, quantity, products(gst_exempt)')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const unitPrice = parseFloat(item.unit_price)
    const qty       = item.quantity
    const taxable   = Math.max(0, unitPrice - discount)
    // Exempt goods stay exempt through a discount — this path used to re-add 5% to rice and
    // sugar the moment a cashier discounted the line.
    const exempt  = !!(Array.isArray(item.products) ? item.products[0] : item.products)?.gst_exempt
    const { gst5, total } = lineMoney(taxable, qty, exempt, await gstBasisFor(supabase, { itemId }))

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

  // Alt+U — ring this line in a different unit (Pcs / Pack / Case).
  //
  // The line keeps its quantity in the SOLD unit and its price per one of that unit, so
  // `quantity x unit_price = total` still holds and every total, report and GST figure stays
  // exactly as it was. The factor enters only where stock is read or written. The rate is
  // re-derived from the price per PIECE the cashier already had, so switching levels never
  // changes what a piece costs.
  if (action === 'set_unit') {
    const { itemId, unitLabel, unitFactor } = body

    const { data: item } = await supabase
      .from('cart_items')
      .select('unit_price, discount, quantity, unit_factor, product_id, batch_id, package_id, products(gst_exempt)')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const toFactor = Math.max(1, parseFloat(unitFactor) || 1)
    const label    = toFactor > 1 ? (String(unitLabel || '').trim() || 'Pack') : null
    const from     = lineFactor(item)

    const perPiece  = parseFloat(item.unit_price) / from
    const unitPrice = parseFloat((perPiece * toFactor).toFixed(2))
    // The per-unit discount scales with the unit too, or a Nu. 5 off a piece would silently
    // become Nu. 5 off a whole case.
    const discount  = parseFloat(((parseFloat(item.discount ?? 0) / from) * toFactor).toFixed(2))

    // Changing level changes what the same quantity takes off the shelf, so the cap is
    // re-checked in the NEW unit and the quantity clamped to it.
    const pieces    = await availableStockFor(supabase, {
      productId: item.product_id,
      batchId:   item.batch_id,
      packageId: item.package_id,
    })
    const available = pieces == null ? null : Math.floor(pieces / toFactor)
    if (available != null && available < 1) {
      return NextResponse.json({ error: 'Not enough stock for a full ' + (label || 'unit'), stockCapped: true, available: 0 }, { status: 409 })
    }
    const stockCapped = available != null && item.quantity > available
    const qty         = stockCapped ? Math.max(1, available) : item.quantity

    const taxable = Math.max(0, unitPrice - discount)
    const exempt  = !!(Array.isArray(item.products) ? item.products[0] : item.products)?.gst_exempt
    const { gst5, total } = lineMoney(taxable, qty, exempt, await gstBasisFor(supabase, { itemId }))

    const { data, error } = await supabase
      .from('cart_items')
      .update({
        unit_label:  label,
        unit_factor: toFactor > 1 ? toFactor : null,
        unit_price:  unitPrice,
        discount,
        quantity:    qty,
        gst_5:       gst5,
        total,
      })
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data, stockCapped, available: stockCapped ? available : null })
  }

  // Ctrl+T — a cashier's note against ONE line ("damaged carton — sold as seen"). Bounded to
  // what the slip can print, matching order_items.remark (migration 135).
  if (action === 'set_remark') {
    const { itemId, remark } = body
    const text = String(remark ?? '').trim().slice(0, 200)

    const { data, error } = await supabase
      .from('cart_items')
      .update({ remark: text || null })
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
      .select('discount, quantity, products(gst_exempt)')
      .eq('id', itemId)
      .single()

    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const price    = Math.max(0, parseFloat(newPrice))
    const discount = parseFloat(item.discount ?? 0)
    const qty      = item.quantity
    const taxable  = Math.max(0, price - discount)
    // Same rule as every other line path: an exempt product carries no GST at any rate.
    const exempt = !!(Array.isArray(item.products) ? item.products[0] : item.products)?.gst_exempt
    const { gst5, total } = lineMoney(taxable, qty, exempt, await gstBasisFor(supabase, { itemId }))

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
