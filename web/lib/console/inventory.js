// Small ownership guards shared by the console inventory routes. Everything is app-layer scoped
// (RLS is dormant), so each mutation must confirm the warehouse / product belongs to the caller.

/** The caller's warehouse, or null. */
export async function ownedWarehouse(supabase, entityId, warehouseId) {
  if (!warehouseId) return null
  const { data } = await supabase
    .from('warehouses').select('id, name, is_active')
    .eq('id', warehouseId).eq('entity_id', entityId).maybeSingle()
  return data || null
}

/** The caller's product, or null. */
export async function ownedProduct(supabase, entityId, productId) {
  if (!productId) return null
  const { data } = await supabase
    .from('products').select('id, name, current_stock, product_type')
    .eq('id', productId).eq('created_by', entityId).maybeSingle()
  return data || null
}

/** Current on-hand of a product in a specific warehouse (0 if none). */
export async function warehouseOnHand(supabase, entityId, warehouseId, productId) {
  const { data } = await supabase
    .from('warehouse_stock').select('quantity')
    .eq('warehouse_id', warehouseId).eq('entity_id', entityId).eq('product_id', productId).maybeSingle()
  return data?.quantity ?? 0
}
