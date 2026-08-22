// FEFO helpers shared by the sellable list and the barcode/search lookup, so the "you're
// selling a newer batch" cashier warning behaves the same however a product reaches the cart.

/**
 * Soonest in-stock batch expiry per product (the FEFO-preferred batch's expiry).
 * @returns {Promise<Map<string,string>>} product_id -> ISO 'YYYY-MM-DD'
 */
export async function earliestExpiryByProduct(supabase, entityId, productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { data } = await supabase
    .from('product_batches')
    .select('product_id, expires_at')
    .in('product_id', ids)
    .eq('entity_id', entityId)
    .eq('status', 'ACTIVE')
    .gt('quantity', 0)
    .not('expires_at', 'is', null)
  const earliest = new Map()
  for (const b of data || []) {
    const cur = earliest.get(b.product_id)
    if (!cur || b.expires_at < cur) earliest.set(b.product_id, b.expires_at)   // ISO strings sort chronologically
  }
  return earliest
}

/** True when this batch expires later than the product's soonest in-stock batch. */
export function hasOlderBatch(batchExpiry, earliestForProduct) {
  return !!(batchExpiry && earliestForProduct && batchExpiry > earliestForProduct)
}
