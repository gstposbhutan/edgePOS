import { resolveLink, ensureKhataAccount } from '@/lib/console/supply-links'

// Shared B2B order engine for the vendor consoles. One set of validation/pricing/receiving helpers
// backs every seller/buyer flow:
//   • createB2BOrder   — immediate sale (WHOLESALE, confirmed now): deduct seller stock, debit khata
//                        on credit, receive into the buyer's inventory. Buy-side restock uses this too.
//   • createSalesOrder — a Sales Order or Quotation (SALES_ORDER, DRAFT): a priced commitment/quote
//                        with NO stock or khata movement until it's invoiced.
//   • convertSalesOrderToInvoice — turn a Sales Order into a Sales Invoice (SALES_INVOICE, confirmed):
//                        deduct seller stock + debit khata (via triggers) + receive into the buyer.
// Keeping it in one place means the flows can't drift.

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
 * (per buyer), package definitions on product_packages.source_package_id.
 * @returns {Promise<{ productId: string|null, error?: string }>}
 */
export async function ensureBuyerMirror(supabase, sellerProductId, buyerId) {
  const { data: existing, error: existErr } = await supabase
    .from('products')
    .select('id')
    .eq('created_by', buyerId)
    .eq('source_product_id', sellerProductId)
    .limit(1)
    .maybeSingle()
  if (existErr) return { productId: null, error: existErr.message }
  if (existing?.id) return { productId: existing.id }

  const { data: seller, error: sellerErr } = await supabase
    .from('products')
    .select('id, name, sku, hsn_code, unit, mrp, wholesale_price, product_type, image_url')
    .eq('id', sellerProductId)
    .maybeSingle()
  if (sellerErr) return { productId: null, error: sellerErr.message }
  if (!seller) return { productId: null, error: `Seller product ${sellerProductId} not found` }

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
      name: seller.name, sku: seller.sku || null, hsn_code: seller.hsn_code || '9999',
      unit: seller.unit || 'pcs', mrp: seller.mrp, wholesale_price: sellPrice(seller),
      image_url: seller.image_url || null, product_type: seller.product_type, is_active: true,
      created_by: buyerId, source_product_id: sellerProductId,
    })
    .select('id')
    .single()
  if (mirrorErr) return { productId: null, error: mirrorErr.message }

  if (seller.product_type !== 'PACKAGE') return { productId: mirror.id }

  const { data: sellerPkg, error: pkgErr } = await supabase
    .from('product_packages')
    .select('id, name, package_type, barcode, qr_code, wholesale_price, mrp, hsn_code, package_items(product_id, quantity)')
    .eq('product_id', sellerProductId)
    .maybeSingle()
  if (pkgErr) return { productId: null, error: pkgErr.message }
  if (!sellerPkg) return { productId: mirror.id }

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
        product_id: mirror.id, name: sellerPkg.name, package_type: sellerPkg.package_type,
        wholesale_price: sellPrice(sellerPkg), mrp: sellerPkg.mrp, hsn_code: sellerPkg.hsn_code,
        is_active: true, stocked_as_unit: true, source_package_id: sellerPkg.id, created_by: buyerId,
      })
      .select('id')
      .single()
    if (buyerPkgErr) return { productId: null, error: buyerPkgErr.message }
    buyerPkgId = buyerPkg.id
    await supabase.from('entity_packages').insert({ entity_id: buyerId, package_id: buyerPkgId, is_default: false })
    for (const it of sellerPkg.package_items ?? []) {
      const child = await ensureBuyerMirror(supabase, it.product_id, buyerId)
      if (child.error) return { productId: null, error: child.error }
      const { error: piErr } = await supabase.from('package_items').insert({ package_id: buyerPkgId, product_id: child.productId, quantity: it.quantity })
      if (piErr) return { productId: null, error: piErr.message }
    }
  }
  return { productId: mirror.id }
}

// ── Internal shared helpers ────────────────────────────────────────────────────────────────────

// Resolve seller/buyer entities and verify an active supply link with the CALLER as the seller
// (upstream/creditor). Returns { ok, sellerEnt, buyerEnt, link } or a { ok:false, status, error }.
async function resolveB2B(supabase, sellerId, buyerId) {
  if (!buyerId) return { ok: false, status: 400, error: 'buyer is required' }
  if (buyerId === sellerId) return { ok: false, status: 400, error: 'Seller and buyer cannot be the same entity' }
  const [{ data: sellerEnt }, { data: buyerEnt }] = await Promise.all([
    supabase.from('entities').select('id, role').eq('id', sellerId).maybeSingle(),
    supabase.from('entities').select('id, role, name').eq('id', buyerId).maybeSingle(),
  ])
  if (!sellerEnt) return { ok: false, status: 400, error: 'Seller entity not found' }
  if (!buyerEnt) return { ok: false, status: 404, error: 'Buyer entity not found' }
  const link = resolveLink(sellerEnt.role, sellerId, buyerEnt.role, buyerId)
  if (!link || link.seller !== sellerId) return { ok: false, status: 400, error: `A ${sellerEnt.role} cannot sell to a ${buyerEnt.role}` }
  const { data: activeLink } = await supabase.from(link.table).select('id').match(link.key).eq('active', true).limit(1)
  if (!activeLink?.length) return { ok: false, status: 403, error: 'No active supply link with this buyer — connect first' }
  return { ok: true, sellerEnt, buyerEnt, link }
}

// Validate a cart against the seller's catalog and price it by the seller's tier. Returns
// { ok, orderItems, subtotal, gstTotal, grandTotal } or { ok:false, status, error }.
async function priceB2BCart(supabase, sellerId, sellerRole, items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, status: 400, error: 'items[] is required' }

  const productIds = [...new Set(items.map(i => i.product_id))]
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, sku, distributor_price, wholesale_price, mrp, current_stock, hsn_code, product_type, product_packages(id, name, package_type, stocked_as_unit, is_active)')
    .in('id', productIds)
    .eq('created_by', sellerId)
    .eq('is_active', true)
  if (prodErr) return { ok: false, status: 500, error: 'Failed to fetch products' }

  const pkgDefsOf = (p) => { const d = p?.product_packages; return Array.isArray(d) ? d : (d ? [d] : []) }
  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]))

  for (const item of items) {
    const p = productMap[item.product_id]
    if (!p) return { ok: false, status: 400, error: `Product ${item.product_id} not in your catalog` }
    if (!item.quantity || item.quantity < 1) return { ok: false, status: 400, error: 'Quantity must be >= 1' }
    if (item.package_id) {
      const def = pkgDefsOf(p).find(d => d.id === item.package_id)
      if (!def || !def.is_active || !def.stocked_as_unit) return { ok: false, status: 400, error: `Package ${item.package_id} is not sellable` }
    }
  }

  let subtotal = 0
  const orderItems = items.map(item => {
    const p = productMap[item.product_id]
    const def = item.package_id ? pkgDefsOf(p).find(d => d.id === item.package_id) : null
    const unitPrice = b2bPriceForSeller(p, sellerRole)
    const qty = item.quantity
    const gst5 = parseFloat((unitPrice * qty * 0.05).toFixed(2))
    const total = parseFloat((unitPrice * qty + gst5).toFixed(2))
    subtotal += unitPrice * qty
    return {
      product_id: p.id, package_id: def ? def.id : null, package_name: def ? (def.name || p.name) : null,
      package_type: def ? def.package_type : null, sku: p.sku, name: p.name, quantity: qty,
      unit_price: unitPrice, discount: 0, gst_5: gst5, total, status: 'ACTIVE',
    }
  })
  const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
  const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))
  return { ok: true, orderItems, subtotal, gstTotal, grandTotal }
}

// Next order number in a per-year series (WHL / SO / SI).
async function nextOrderNo(supabase, prefix) {
  const year = new Date().getFullYear()
  const { data: last } = await supabase
    .from('orders').select('order_no').like('order_no', `${prefix}-${year}-%`)
    .order('created_at', { ascending: false }).limit(1)
  let serial = 1
  if (last?.length) {
    const m = last[0].order_no.match(new RegExp(`${prefix}-\\d+-(\\d+)`))
    if (m) serial = parseInt(m[1]) + 1
  }
  return `${prefix}-${year}-${String(serial).padStart(4, '0')}`
}

// Shape order_items JSONB the way the orders.items snapshot stores it.
function itemsSnapshot(orderItems) {
  return orderItems.map(i => ({
    product_id: i.product_id, package_id: i.package_id, package_name: i.package_name,
    package_type: i.package_type, sku: i.sku, name: i.name, qty: i.quantity,
    rate: i.unit_price, discount: i.discount, gst_5: i.gst_5, total: i.total,
  }))
}

// Receive an order's lines into the buyer's own stock (mirror + RESTOCK), idempotent on
// (reference_id, product_id, entity). Returns a list of warnings (empty on full success).
async function receiveIntoBuyer(supabase, order, orderItems, buyerId) {
  const warnings = []
  for (const item of orderItems) {
    try {
      const { productId, error: mirrorErr } = await ensureBuyerMirror(supabase, item.product_id, buyerId)
      if (mirrorErr || !productId) { warnings.push(`mirror ${item.name}: ${mirrorErr || 'no product'}`); continue }
      const { data: prior } = await supabase
        .from('inventory_movements').select('id')
        .eq('reference_id', order.id).eq('product_id', productId).eq('entity_id', buyerId).eq('movement_type', 'RESTOCK')
        .limit(1)
      if (prior?.length) continue
      const { error: mvErr } = await supabase.from('inventory_movements').insert({
        product_id: productId, entity_id: buyerId, movement_type: 'RESTOCK', quantity: item.quantity,
        reference_id: order.id, package_id: item.package_id || null,
        package_qty: item.package_id ? item.quantity : null, notes: `Received on order ${order.order_no}`,
      })
      if (mvErr) warnings.push(`restock ${item.name}: ${mvErr.message}`)
    } catch (e) {
      warnings.push(`receive ${item.name}: ${e.message}`)
    }
  }
  return warnings
}

// Insert order_items rows for an order.
async function insertOrderItems(supabase, orderId, orderItems) {
  const rows = orderItems.map(i => ({ id: crypto.randomUUID(), order_id: orderId, ...i }))
  return supabase.from('order_items').insert(rows)
}

// ── Public creators ────────────────────────────────────────────────────────────────────────────

/**
 * Immediate B2B sale: create + confirm a WHOLESALE order from sellerId to buyerId. Deducts the
 * seller's stock, debits the buyer's khata on CREDIT, and receives the goods into the buyer.
 * @returns {Promise<{ ok:true, order, warning? } | { ok:false, status, error, order? }>}
 */
export async function createB2BOrder({ supabase, sellerId, buyerId, items, userId, paymentMethod = 'CREDIT' }) {
  const method = String(paymentMethod || 'CREDIT').toUpperCase()
  if (!['CREDIT', 'CASH'].includes(method)) return { ok: false, status: 400, error: 'payment_method must be CREDIT or CASH' }

  const ctx = await resolveB2B(supabase, sellerId, buyerId)
  if (!ctx.ok) return ctx
  if (method === 'CREDIT') {
    const khata = await ensureKhataAccount(supabase, { seller: sellerId, buyer: buyerId, createdBy: userId })
    if (khata.error) return { ok: false, status: 500, error: `Could not prepare credit account: ${khata.error}` }
  }
  const priced = await priceB2BCart(supabase, sellerId, ctx.sellerEnt.role, items)
  if (!priced.ok) return priced

  const orderNo = await nextOrderNo(supabase, 'WHL')
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_type: 'WHOLESALE', order_no: orderNo, status: 'DRAFT', seller_id: sellerId, buyer_id: buyerId,
      items: itemsSnapshot(priced.orderItems), subtotal: priced.subtotal, gst_total: priced.gstTotal,
      grand_total: priced.grandTotal, payment_method: method, created_by: userId,
    })
    .select('id, order_no, status, grand_total')
    .single()
  if (orderErr) return { ok: false, status: 500, error: 'Failed to create order' }

  const { error: itemsErr } = await insertOrderItems(supabase, order.id, priced.orderItems)
  if (itemsErr) return { ok: false, status: 200, error: 'Order created but items failed', order }

  const { error: confirmErr } = await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', order.id)
  if (confirmErr) return { ok: false, status: 400, error: confirmErr.message, order }
  order.status = 'CONFIRMED'

  const warnings = await receiveIntoBuyer(supabase, order, priced.orderItems, buyerId)
  return warnings.length ? { ok: true, order, warning: `Some lines not received: ${warnings.join('; ')}` } : { ok: true, order }
}

/**
 * Create a Sales Order (or Quotation) from sellerId to buyerId: a priced DRAFT SALES_ORDER with NO
 * stock or khata movement. Invoice it later with convertSalesOrderToInvoice.
 * @returns {Promise<{ ok:true, order } | { ok:false, status, error }>}
 */
export async function createSalesOrder({ supabase, sellerId, buyerId, items, userId, paymentMethod = 'CREDIT', isQuotation = false }) {
  const method = String(paymentMethod || 'CREDIT').toUpperCase()
  if (!['CREDIT', 'CASH'].includes(method)) return { ok: false, status: 400, error: 'payment_method must be CREDIT or CASH' }

  const ctx = await resolveB2B(supabase, sellerId, buyerId)
  if (!ctx.ok) return ctx
  const priced = await priceB2BCart(supabase, sellerId, ctx.sellerEnt.role, items)
  if (!priced.ok) return priced

  const orderNo = await nextOrderNo(supabase, isQuotation ? 'QT' : 'SO')
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_type: 'SALES_ORDER', order_no: orderNo, status: 'DRAFT', is_quotation: !!isQuotation,
      seller_id: sellerId, buyer_id: buyerId, items: itemsSnapshot(priced.orderItems),
      subtotal: priced.subtotal, gst_total: priced.gstTotal, grand_total: priced.grandTotal,
      payment_method: method, created_by: userId,
    })
    .select('id, order_no, status, grand_total, is_quotation')
    .single()
  if (orderErr) return { ok: false, status: 500, error: 'Failed to create sales order' }

  const { error: itemsErr } = await insertOrderItems(supabase, order.id, priced.orderItems)
  if (itemsErr) return { ok: false, status: 200, error: 'Sales order created but items failed', order }
  return { ok: true, order }
}

/**
 * Convert a Sales Order into a Sales Invoice (full conversion): create a CONFIRMED SALES_INVOICE that
 * deducts the seller's stock (deduct_stock_on_sales_invoice) and debits the buyer's khata on CREDIT
 * (per-tier trigger), receive the goods into the buyer, and mark the SO CONFIRMED.
 * @returns {Promise<{ ok:true, invoice, warning? } | { ok:false, status, error, invoice? }>}
 */
export async function convertSalesOrderToInvoice({ supabase, sellerId, soId, userId }) {
  const { data: so, error: soErr } = await supabase
    .from('orders')
    .select('id, order_no, status, seller_id, buyer_id, payment_method, is_quotation')
    .eq('id', soId).eq('order_type', 'SALES_ORDER').maybeSingle()
  if (soErr || !so) return { ok: false, status: 404, error: 'Sales order not found' }
  if (so.seller_id !== sellerId) return { ok: false, status: 403, error: 'Not your sales order' }
  if (so.status !== 'DRAFT') return { ok: false, status: 409, error: `Sales order is already ${so.status}` }
  if (!so.buyer_id) return { ok: false, status: 400, error: 'Sales order has no buyer' }

  const { data: soItems, error: siErr } = await supabase
    .from('order_items')
    .select('product_id, package_id, package_name, package_type, sku, name, quantity, unit_price, discount, gst_5, total')
    .eq('order_id', soId).eq('status', 'ACTIVE')
  if (siErr) return { ok: false, status: 500, error: 'Failed to read sales-order lines' }
  if (!soItems?.length) return { ok: false, status: 400, error: 'Sales order has no active lines' }

  const method = so.payment_method || 'CREDIT'
  if (method === 'CREDIT') {
    const khata = await ensureKhataAccount(supabase, { seller: sellerId, buyer: so.buyer_id, createdBy: userId })
    if (khata.error) return { ok: false, status: 500, error: `Could not prepare credit account: ${khata.error}` }
  }

  const orderItems = soItems.map(i => ({ ...i, status: 'ACTIVE' }))
  const subtotal = orderItems.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0)
  const gstTotal = parseFloat((subtotal * 0.05).toFixed(2))
  const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

  const invNo = await nextOrderNo(supabase, 'SI')
  const { data: invoice, error: invErr } = await supabase
    .from('orders')
    .insert({
      order_type: 'SALES_INVOICE', order_no: invNo, status: 'DRAFT', seller_id: sellerId, buyer_id: so.buyer_id,
      sales_order_id: soId, items: itemsSnapshot(orderItems), subtotal: parseFloat(subtotal.toFixed(2)),
      gst_total: gstTotal, grand_total: grandTotal, payment_method: method, created_by: userId,
    })
    .select('id, order_no, status, grand_total')
    .single()
  if (invErr) return { ok: false, status: 500, error: 'Failed to create invoice' }

  const { error: itemsErr } = await insertOrderItems(supabase, invoice.id, orderItems)
  if (itemsErr) return { ok: false, status: 200, error: 'Invoice created but items failed', invoice }

  // Confirm — fires deduct_stock_on_sales_invoice + the per-tier khata debit on CREDIT.
  const { error: confirmErr } = await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', invoice.id)
  if (confirmErr) return { ok: false, status: 400, error: confirmErr.message, invoice }
  invoice.status = 'CONFIRMED'

  const warnings = await receiveIntoBuyer(supabase, invoice, orderItems, so.buyer_id)

  // Mark the SO fully fulfilled.
  await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', soId)

  return warnings.length ? { ok: true, invoice, warning: `Some lines not received: ${warnings.join('; ')}` } : { ok: true, invoice }
}
