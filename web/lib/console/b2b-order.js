import { resolveLink, ensureKhataAccount } from '@/lib/console/supply-links'

// Shared B2B order engine for the vendor consoles. One creator drives both directions of the same
// tier-to-tier sale:
//   • buyer-initiated  — a wholesaler restocks from a linked distributor (`/api/console/orders` POST)
//   • seller-initiated — a distributor/wholesaler sells to a linked downstream buyer (`/api/console/sales` POST)
// Both produce the same order shape and fire the same DB triggers (deduct seller stock on CONFIRM,
// debit the buyer khata on a CREDIT confirm), plus a manual "receive-on-buy" that adds the sold goods
// to the buyer's own inventory. Keeping it in one place means the two routes can never drift.

// Best B2B unit price for a seller of a given tier. A distributor sells at distributor_price (→
// wholesale → mrp); a wholesaler sells at wholesale_price (→ mrp) — a wholesaler's distributor_price,
// if any, is what THEY pay upstream and must never leak into what a retailer is charged.
export function b2bPriceForSeller(p, sellerRole) {
  const ladder = sellerRole === 'DISTRIBUTOR'
    ? [p.distributor_price, p.wholesale_price, p.mrp]
    : [p.wholesale_price, p.mrp]
  for (const c of ladder) {
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
export async function ensureBuyerMirror(supabase, sellerProductId, buyerId) {
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
  // back to the level's mrp.
  const sellPrice = (p) => {
    for (const c of [p?.wholesale_price, p?.mrp]) {
      const n = parseFloat(c)
      if (Number.isFinite(n) && n > 0) return n
    }
    return seller.wholesale_price ?? null
  }

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

    await supabase.from('entity_packages').insert({
      entity_id: buyerId, package_id: buyerPkgId, is_default: false,
    })

    const pkgItems = sellerPkg.package_items ?? []
    for (const it of pkgItems) {
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

/**
 * Create + confirm a B2B order from `sellerId` to `buyerId` for `items`. Validates the active supply
 * link and the seller's catalog, prices per the seller's tier, inserts the order (items JSONB +
 * order_items), flips it to CONFIRMED (firing deduct-stock and, for CREDIT, the khata debit), then
 * receives the goods into the buyer's own inventory.
 *
 * @returns {Promise<{ ok: true, order } | { ok: false, status: number, error: string, order? }>}
 */
export async function createB2BOrder({ supabase, sellerId, buyerId, items, userId, paymentMethod = 'CREDIT' }) {
  if (!buyerId || !Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, error: 'buyer and items[] are required' }
  }
  if (buyerId === sellerId) return { ok: false, status: 400, error: 'Seller and buyer cannot be the same entity' }
  const method = String(paymentMethod || 'CREDIT').toUpperCase()
  if (!['CREDIT', 'CASH'].includes(method)) {
    return { ok: false, status: 400, error: 'payment_method must be CREDIT or CASH' }
  }

  // Resolve the junction for this pair and confirm the CALLER is the seller (upstream/creditor).
  const [{ data: sellerEnt }, { data: buyerEnt }] = await Promise.all([
    supabase.from('entities').select('id, role').eq('id', sellerId).maybeSingle(),
    supabase.from('entities').select('id, role, name').eq('id', buyerId).maybeSingle(),
  ])
  if (!sellerEnt) return { ok: false, status: 400, error: 'Seller entity not found' }
  if (!buyerEnt) return { ok: false, status: 404, error: 'Buyer entity not found' }

  const link = resolveLink(sellerEnt.role, sellerId, buyerEnt.role, buyerId)
  if (!link || link.seller !== sellerId) {
    return { ok: false, status: 400, error: `A ${sellerEnt.role} cannot sell to a ${buyerEnt.role}` }
  }

  const { data: activeLink } = await supabase
    .from(link.table)
    .select('id')
    .match(link.key)
    .eq('active', true)
    .limit(1)
  if (!activeLink?.length) {
    return { ok: false, status: 403, error: 'No active supply link with this buyer — connect first' }
  }

  // A CREDIT order debits the buyer's khata on confirm; make sure the account exists first.
  if (method === 'CREDIT') {
    const khata = await ensureKhataAccount(supabase, { seller: sellerId, buyer: buyerId, createdBy: userId })
    if (khata.error) return { ok: false, status: 500, error: `Could not prepare credit account: ${khata.error}` }
  }

  // Load the seller's sellable products (SINGLE + PACKAGE) and validate the cart.
  const productIds = [...new Set(items.map(i => i.product_id))]
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, sku, distributor_price, wholesale_price, mrp, current_stock, hsn_code, product_type, product_packages(id, name, package_type, stocked_as_unit, is_active)')
    .in('id', productIds)
    .eq('created_by', sellerId)
    .eq('is_active', true)
  if (prodErr) return { ok: false, status: 500, error: 'Failed to fetch products' }

  const pkgDefsOf = (p) => {
    const d = p?.product_packages
    return Array.isArray(d) ? d : (d ? [d] : [])
  }
  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

  for (const item of items) {
    const p = productMap[item.product_id]
    if (!p) return { ok: false, status: 400, error: `Product ${item.product_id} not in your catalog` }
    if (!item.quantity || item.quantity < 1) return { ok: false, status: 400, error: 'Quantity must be >= 1' }
    if (item.package_id) {
      const def = pkgDefsOf(p).find(d => d.id === item.package_id)
      if (!def || !def.is_active || !def.stocked_as_unit) {
        return { ok: false, status: 400, error: `Package ${item.package_id} is not sellable` }
      }
    }
  }

  // Build line items. GST is the flat 5%, tax-exclusive, per line.
  let subtotal = 0
  const orderItems = items.map(item => {
    const p = productMap[item.product_id]
    const def = item.package_id ? pkgDefsOf(p).find(d => d.id === item.package_id) : null
    const unitPrice = b2bPriceForSeller(p, sellerEnt.role)
    const qty = item.quantity
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
      discount: 0,
      gst_5: gst5,
      total,
      status: 'ACTIVE',
    }
  })
  const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
  const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

  // Order number — the shared WHL-YYYY-NNNN series (same order_type as the wholesale flow).
  const year = new Date().getFullYear()
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('order_no')
    .like('order_no', `WHL-${year}-%`)
    .order('created_at', { ascending: false })
    .limit(1)
  let serial = 1
  if (lastOrder?.length) {
    const m = lastOrder[0].order_no.match(/WHL-\d+-(\d+)/)
    if (m) serial = parseInt(m[1]) + 1
  }
  const orderNo = `WHL-${year}-${String(serial).padStart(4, '0')}`

  // Create the order as DRAFT.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_type: 'WHOLESALE',
      order_no: orderNo,
      status: 'DRAFT',
      seller_id: sellerId,
      buyer_id: buyerId,
      items: orderItems.map(i => ({
        product_id: i.product_id, package_id: i.package_id, package_name: i.package_name,
        package_type: i.package_type, sku: i.sku, name: i.name, qty: i.quantity,
        rate: i.unit_price, discount: i.discount, gst_5: i.gst_5, total: i.total,
      })),
      subtotal,
      gst_total: gstTotal,
      grand_total: grandTotal,
      payment_method: method,
      created_by: userId,
    })
    .select('id, order_no, status, grand_total')
    .single()
  if (orderErr) return { ok: false, status: 500, error: 'Failed to create order' }

  const itemRows = orderItems.map(item => ({ id: crypto.randomUUID(), order_id: order.id, ...item }))
  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows)
  if (itemsErr) return { ok: false, status: 200, error: 'Order created but items failed', order }

  // Confirm — fires deduct_stock_on_confirm and (for CREDIT) the per-tier khata debit.
  const { error: confirmErr } = await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', order.id)
  if (confirmErr) return { ok: false, status: 400, error: confirmErr.message, order }
  order.status = 'CONFIRMED'

  // Receive-on-buy: add each sold line to the buyer's own stock (mirror + RESTOCK movement),
  // idempotent on (reference_id, product_id).
  const restockWarnings = []
  for (const item of orderItems) {
    try {
      const { productId, error: mirrorErr } = await ensureBuyerMirror(supabase, item.product_id, buyerId)
      if (mirrorErr || !productId) { restockWarnings.push(`mirror ${item.name}: ${mirrorErr || 'no product'}`); continue }
      const { data: prior } = await supabase
        .from('inventory_movements')
        .select('id')
        .eq('reference_id', order.id).eq('product_id', productId).eq('entity_id', buyerId).eq('movement_type', 'RESTOCK')
        .limit(1)
      if (prior?.length) continue
      const { error: mvErr } = await supabase.from('inventory_movements').insert({
        product_id: productId, entity_id: buyerId, movement_type: 'RESTOCK', quantity: item.quantity,
        reference_id: order.id, package_id: item.package_id || null,
        package_qty: item.package_id ? item.quantity : null, notes: `Received on order ${order.order_no}`,
      })
      if (mvErr) restockWarnings.push(`restock ${item.name}: ${mvErr.message}`)
    } catch (e) {
      restockWarnings.push(`receive ${item.name}: ${e.message}`)
    }
  }
  if (restockWarnings.length) {
    return { ok: true, order, warning: `Some lines not received: ${restockWarnings.join('; ')}` }
  }
  return { ok: true, order }
}
