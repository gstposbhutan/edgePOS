import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/products/search?q=...&entity_id=...&table=sellable_products|products
 *
 * Searches products by name or SKU. Used by receive-stock-modal,
 * draft-purchase-review, and create-marketplace-order-modal.
 *
 * Query params:
 *   q         - search query (name or SKU)
 *   entity_id - optional, defaults to auth context entityId
 *   table     - 'products' (default) or 'sellable_products'
 *   limit     - max results (default 10)
 */
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q        = searchParams.get('q') ?? ''
  const table    = searchParams.get('table') ?? 'products'
  const limit    = parseInt(searchParams.get('limit') ?? '10', 10)
  const entityId = searchParams.get('entity_id') ?? ctx.entityId

  if (!q.trim()) return NextResponse.json({ products: [] })

  const supabase = ctx.supabase

  if (table === 'sellable_products') {
    // Marketplace order modal: search sellable products for an entity
    const { data, error } = await supabase
      .from('sellable_products')
      .select('id, name, sku, mrp, available_stock')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .gt('available_stock', 0)
      .eq('is_active', true)
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data ?? [] })
  }

  // Default: search products table
  const selectFields = 'id, name, sku, mrp, selling_price, wholesale_price, current_stock'
  const { data, error } = await supabase
    .from('products')
    .select(selectFields)
    .eq('entity_id', entityId)
    .eq('is_active', true)
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [] })
}
