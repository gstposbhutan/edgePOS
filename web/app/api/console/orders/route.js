import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Orders for the distributor / wholesaler consoles. Two halves of the same B2B flow:
//
//   GET  — incoming orders where I am the seller (sales TO me's buyers). Read-only list for both
//          consoles, scoped to ctx.entityId, OWNER/MANAGER gated.
//   POST — buyer restock: a wholesaler orders from a linked distributor's catalog. This clones the
//          retailer→wholesaler logic from /api/wholesale/orders, only flipped one tier up:
//          seller_id = the distributor (supplier), buyer_id = my entity (the wholesaler), the unit
//          price comes from products.distributor_price, and the same orders triggers
//          (deduct_stock_on_confirm, khata_debit_on_confirm) fire on CONFIRMED exactly as they do
//          for the retailer flow. We do NOT touch the retailer routes — this is a parallel copy in
//          the console namespace so the two tiers can diverge later.
//
// Model B (P4): a wholesaler can order at ANY level — a SINGLE piece, or a PACKAGE box/pallet.
//   * On confirm the existing deduct trigger decrements the SELLER's package-product current_stock
//     (it keys on oi.product_id, which we set to the seller's PACKAGE product — already Model B).
//   * Receive-on-buy: the same confirm then ADDS the bought level to the BUYER's stock. Because
//     stock lives per-entity on products.current_stock, the buyer needs its OWN product (and, for a
//     package, its own mirror tree) to hold it. ensureBuyerMirror() provisions that lazily and
//     idempotently (deduped on source_product_id / source_package_id), then we insert a buyer-side
//     RESTOCK movement so apply_inventory_movement bumps the buyer's current_stock. The restock is
//     itself idempotent on (reference_id, product_id) so it can never double-count against the
//     restock_buyer_on_delivery trigger (which only fires on DELIVERED — a state this flow skips).

// Best B2B unit price for a product/level: distributor rate first, then wholesale, then mrp.
function b2bPrice(p) {
  for (const c of [p.distributor_price, p.wholesale_price, p.mrp]) {
    const n = parseFloat(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/**
 * Provision (or reuse) the buyer's own mirror of a seller product, recursively for packages, and
 * return the buyer's product id. Idempotent: SINGLE/PACKAGE products dedupe on products.source_product_id
 * (per buyer), package definitions on product_packages.source_package_id. For a PACKAGE the component
 * tree is mirrored first so the buyer's package_items point at the buyer's OWN components — opening
 * the buyer's pallet then releases stock into the buyer's own box, not the seller's.
 *
 * @returns {Promise<{ productId: string|null, error?: string }>}
 */
async function ensureBuyerMirror(supabase, sellerProductId, buyerId) {
  // Already mirrored for this buyer? Reuse it (covers SINGLE and PACKAGE).
  const { data: existing, error: existErr } = await supabase
    .from('products')
    .select('id')
    .eq('created_by', buyerId)
    .eq('source_product_id', sellerProductId)
    .limit(1)
    .maybeSingle()
  if (existErr) return { productId: null, error: existErr.message }
  if (existing?.id) return { productId: existing.id }

  // Load the seller product to clone its shape.
  const { data: seller, error: sellerErr } = await supabase
    .from('products')
    .select('id, name, sku, hsn_code, unit, mrp, wholesale_price, product_type, image_url')
    .eq('id', sellerProductId)
    .maybeSingle()
  if (sellerErr) return { productId: null, error: sellerErr.message }
  if (!seller) return { productId: null, error: `Seller product ${sellerProductId} not found` }

  // Seed the buyer's sell price for this level. Sellers price the level THEY sell (a distributor
  // prices the pallet, not the boxes inside it), so a received-then-opened sub-level often arrives
  // with wholesale_price = 0 and only an mrp. The buyer must still be able to on-sell it, so fall
  // back to the level's mrp. Without this the opened box never carries a price and is invisible to
  // /api/wholesale/catalog (which filters wholesale_price > 0), breaking sell-any-level (Model B).
  const sellPrice = (p) => {
    for (const c of [p?.wholesale_price, p?.mrp]) {
      const n = parseFloat(c)
      if (Number.isFinite(n) && n > 0) return n
    }
    return seller.wholesale_price ?? null
  }

  // Create the buyer's mirror products row (created_by = buyer, no opening stock — the RESTOCK
  // movement drives current_stock). source_product_id marks provenance + dedupes future receives.
  const { data: mirror, error: mirrorErr } = await supabase
    .from('products')
    .insert({
      name:             seller.name,
      sku:              seller.sku || null,
      hsn_code:         seller.hsn_code || '9999',
      unit:             seller.unit || 'pcs',
      mrp:              seller.mrp,
      wholesale_price:  sellPrice(seller),
      image_url:        seller.image_url || null,
      product_type:     seller.product_type,
      is_active:        true,
      created_by:       buyerId,
      source_product_id: sellerProductId,
    })
    .select('id')
    .single()
  if (mirrorErr) return { productId: null, error: mirrorErr.message }

  // SINGLE — done.
  if (seller.product_type !== 'PACKAGE') return { productId: mirror.id }

  // PACKAGE — mirror the definition + its component tree so OPEN works in the buyer's context.
  const { data: sellerPkg, error: pkgErr } = await supabase
    .from('product_packages')
    .select('id, name, package_type, barcode, qr_code, wholesale_price, mrp, hsn_code, package_items(product_id, quantity)')
    .eq('product_id', sellerProductId)
    .maybeSingle()
  if (pkgErr) return { productId: null, error: pkgErr.message }
  if (!sellerPkg) return { productId: mirror.id }   // package product with no definition — leave bare

  // Dedupe the package definition on source_package_id (a prior receive may have created it even if
  // the product lookup above raced); otherwise create the buyer's mirror definition.
  let buyerPkgId
  const { data: existingPkg } = await supabase
    .from('product_packages')
    .select('id')
    .eq('created_by', buyerId)
    .eq('source_package_id', sellerPkg.id)
    .limit(1)
    .maybeSingle()

  if (existingPkg?.id) {
    buyerPkgId = existingPkg.id
  } else {
    const { data: buyerPkg, error: buyerPkgErr } = await supabase
      .from('product_packages')
      .insert({
        product_id:       mirror.id,
        name:             sellerPkg.name,
        package_type:     sellerPkg.package_type,
        // Barcodes are unique-ish identifiers; don't copy them onto the buyer's row.
        wholesale_price:  sellPrice(sellerPkg),
        mrp:              sellerPkg.mrp,
        hsn_code:         sellerPkg.hsn_code,
        is_active:        true,
        stocked_as_unit:  true,
        source_package_id: sellerPkg.id,
        created_by:       buyerId,
      })
      .select('id')
      .single()
    if (buyerPkgErr) return { productId: null, error: buyerPkgErr.message }
    buyerPkgId = buyerPkg.id

    // Associate with the buyer so it shows in their packages list.
    await supabase.from('entity_packages').insert({
      entity_id: buyerId, package_id: buyerPkgId, is_default: false,
    })

    // Mirror each component (recursively) and point the buyer's package_items at the buyer's copies.
    const items = sellerPkg.package_items ?? []
    for (const it of items) {
      const child = await ensureBuyerMirror(supabase, it.product_id, buyerId)
      if (child.error) return { productId: null, error: child.error }
      const { error: piErr } = await supabase.from('package_items').insert({
        package_id: buyerPkgId,
        product_id: child.productId,
        quantity:   it.quantity,
      })
      if (piErr) return { productId: null, error: piErr.message }
    }
  }

  return { productId: mirror.id }
}

/** GET /api/console/orders — incoming orders where this entity is the seller. */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, subtotal, gst_total, grand_total, payment_method, created_at, buyer_id, seller_id, items')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data: orders, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with the buyer's business name (the counter-party on an incoming order).
    if (orders?.length) {
      const buyerIds = [...new Set(orders.map(o => o.buyer_id).filter(Boolean))]
      if (buyerIds.length) {
        const { data: entities } = await supabase
          .from('entities')
          .select('id, name')
          .in('id', buyerIds)
        const nameById = Object.fromEntries((entities || []).map(e => [e.id, e.name]))
        orders.forEach(o => { o.buyer_name = nameById[o.buyer_id] || 'Unknown' })
      } else {
        orders.forEach(o => { o.buyer_name = o.buyer_id ? 'Unknown' : 'Walk-in' })
      }
    }

    return NextResponse.json({ orders: orders ?? [] })
  } catch (err) {
    console.error('[console/orders] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/orders — wholesaler places a restock order with a linked distributor. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, role, userId, supabase } = ctx
    if (role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers can order from distributors' }, { status: 403 })
    }

    const body = await request.json()
    const { supplier_id, items } = body
    if (!supplier_id || !items?.length) {
      return NextResponse.json({ error: 'supplier_id and items[] required' }, { status: 400 })
    }

    // Verify the distributor↔wholesaler link (mirror the retailer_wholesalers check).
    const { data: link } = await supabase
      .from('distributor_wholesalers')
      .select('distributor_id')
      .eq('distributor_id', supplier_id)
      .eq('wholesaler_id', entityId)
      .eq('active', true)
      .limit(1)

    if (!link?.length) {
      return NextResponse.json({ error: 'Not linked to this distributor' }, { status: 403 })
    }

    // Fetch the distributor's sellable products (SINGLE + PACKAGE) and validate the cart. A package
    // line carries package_id, but its product_id is still the seller's PACKAGE product, so we
    // validate every line by product_id and pull the package definition for the package ones.
    const productIds = [...new Set(items.map(i => i.product_id))]
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku, distributor_price, wholesale_price, mrp, current_stock, hsn_code, product_type, product_packages(id, name, package_type, stocked_as_unit, is_active)')
      .in('id', productIds)
      .eq('created_by', supplier_id)
      .eq('is_active', true)

    if (prodErr) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })

    // PostgREST returns an embedded one-to-(zero|one) relation as an object, but a one-to-many as
    // an array; normalise product_packages to an array so the lookups below are uniform.
    const pkgDefsOf = (p) => {
      const d = p?.product_packages
      return Array.isArray(d) ? d : (d ? [d] : [])
    }

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

    for (const item of items) {
      const p = productMap[item.product_id]
      if (!p) {
        return NextResponse.json({ error: `Product ${item.product_id} not found in distributor catalog` }, { status: 400 })
      }
      if (!item.quantity || item.quantity < 1) {
        return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })
      }
      // A package line must reference a real, active, Model-B package on this product.
      if (item.package_id) {
        const def = pkgDefsOf(p).find(d => d.id === item.package_id)
        if (!def || !def.is_active || !def.stocked_as_unit) {
          return NextResponse.json({ error: `Package ${item.package_id} not orderable from this distributor` }, { status: 400 })
        }
      }
    }

    // Build line items. Buy price = distributor_price → wholesale_price → mrp. GST is the flat 5%,
    // tax-exclusive, per line. Package lines also carry package_id/name/type for the order record;
    // product_id stays the seller's PACKAGE product so the deduct trigger hits the right stock.
    let subtotal = 0
    const orderItems = items.map(item => {
      const p = productMap[item.product_id]
      const def = item.package_id ? pkgDefsOf(p).find(d => d.id === item.package_id) : null
      const unitPrice = b2bPrice(p)
      const qty = item.quantity
      const discount = 0
      const gst5 = parseFloat((unitPrice * qty * 0.05).toFixed(2))
      const total = parseFloat((unitPrice * qty + gst5).toFixed(2))
      subtotal += unitPrice * qty

      return {
        product_id: p.id,
        package_id: def ? def.id : null,
        package_name: def ? (def.name || p.name) : null,
        package_type: def ? def.package_type : null,
        sku: p.sku,
        name: p.name,
        quantity: qty,
        unit_price: unitPrice,
        discount,
        gst_5: gst5,
        total,
        status: 'ACTIVE',
      }
    })

    const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
    const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

    // Order number — same WHL-YYYY-NNNN series the wholesale flow uses (it's the same order_type).
    const year = new Date().getFullYear()
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('order_no')
      .like('order_no', `WHL-${year}-%`)
      .order('created_at', { ascending: false })
      .limit(1)

    let serial = 1
    if (lastOrder?.length) {
      const match = lastOrder[0].order_no.match(/WHL-\d+-(\d+)/)
      if (match) serial = parseInt(match[1]) + 1
    }
    const orderNo = `WHL-${year}-${String(serial).padStart(4, '0')}`

    // Create the order as DRAFT — seller is the distributor, buyer is me (the wholesaler).
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_type: 'WHOLESALE',
        order_no: orderNo,
        status: 'DRAFT',
        seller_id: supplier_id,
        buyer_id: entityId,
        items: orderItems.map(i => ({
          product_id: i.product_id,
          package_id: i.package_id,
          package_name: i.package_name,
          package_type: i.package_type,
          sku: i.sku,
          name: i.name,
          qty: i.quantity,
          rate: i.unit_price,
          discount: i.discount,
          gst_5: i.gst_5,
          total: i.total,
        })),
        subtotal,
        gst_total: gstTotal,
        grand_total: grandTotal,
        payment_method: 'CREDIT',
        created_by: userId,
      })
      .select('id, order_no, status, grand_total')
      .single()

    if (orderErr) {
      console.error('[console/orders] order insert error:', orderErr)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Insert order_items (same shape as the wholesale flow). Each row gets a fresh UUID.
    const itemRows = orderItems.map(item => ({
      id: crypto.randomUUID(),
      order_id: order.id,
      ...item,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(itemRows)
    if (itemsErr) {
      console.error('[console/orders] order items insert error:', itemsErr)
      return NextResponse.json({ order, warning: 'Order created but items failed' })
    }

    // Move to CONFIRMED — this fires the same triggers as the retailer flow: distributor stock is
    // deducted and the wholesaler's khata with the distributor is debited (credit-limit checked).
    const { error: confirmErr } = await supabase
      .from('orders')
      .update({ status: 'CONFIRMED' })
      .eq('id', order.id)

    if (confirmErr) {
      console.error('[console/orders] order confirm error:', confirmErr)
      // Left as DRAFT — surface a warning so the caller knows it wasn't confirmed.
      return NextResponse.json({ order, warning: confirmErr.message })
    }
    order.status = 'CONFIRMED'

    // Receive-on-buy: the confirm above deducted the seller's stock for each line; now add the
    // bought level to the buyer's OWN stock. For each line we provision the buyer's mirror of the
    // ordered product (recursively for packages, deduped on source) and insert a buyer-side RESTOCK
    // movement, which the inventory_movement_apply trigger turns into +qty current_stock. The
    // movement is keyed by reference_id = order.id; we skip any line already restocked for this
    // order so a retry — or the restock_buyer_on_delivery trigger, were it ever to fire — can't
    // double-count. A failure here leaves a warning (the order/seller-deduct already stand).
    const restockWarnings = []
    for (const item of orderItems) {
      try {
        const { productId, error: mirrorErr } = await ensureBuyerMirror(supabase, item.product_id, entityId)
        if (mirrorErr || !productId) {
          restockWarnings.push(`mirror ${item.name}: ${mirrorErr || 'no product'}`)
          continue
        }

        // Idempotency guard: already restocked this product for this order?
        const { data: prior } = await supabase
          .from('inventory_movements')
          .select('id')
          .eq('reference_id', order.id)
          .eq('product_id', productId)
          .eq('entity_id', entityId)
          .eq('movement_type', 'RESTOCK')
          .limit(1)
        if (prior?.length) continue

        const { error: mvErr } = await supabase.from('inventory_movements').insert({
          product_id:    productId,
          entity_id:     entityId,
          movement_type: 'RESTOCK',
          quantity:      item.quantity,
          reference_id:  order.id,
          package_id:    item.package_id || null,
          package_qty:   item.package_id ? item.quantity : null,
          notes:         `Received on order ${order.order_no}`,
        })
        if (mvErr) restockWarnings.push(`restock ${item.name}: ${mvErr.message}`)
      } catch (e) {
        restockWarnings.push(`receive ${item.name}: ${e.message}`)
      }
    }

    if (restockWarnings.length) {
      console.error('[console/orders] receive-on-buy warnings:', restockWarnings)
      return NextResponse.json({ order, warning: `Some lines not received: ${restockWarnings.join('; ')}` }, { status: 201 })
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (err) {
    console.error('[console/orders] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
