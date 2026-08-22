import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { earliestExpiryByProduct, hasOlderBatch } from '@/lib/products/fefo'

const SELECT_FIELDS = 'id, name, sku, hsn_code, image_url, available_stock, wholesale_price, mrp, selling_price, unit, product_type, package_type, package_def_id, package_barcode, reorder_point, batch_id, batch_number, expires_at, batch_barcode, barcode, category, subcategory, condition, description, brand, tags, specifications, video_url, sold_by_weight, gst_exempt'

// Attach FEFO context so the sale screen can warn when a cashier adds a batch that isn't the
// soonest-expiring one. (Kept in the route, not the core sellable view, to avoid touching it.)
async function enrichFefo(products, supabase, entityId) {
  if (!products.length) return products
  const ids = [...new Set(products.map(p => p.id))]

  const { data: rots } = await supabase
    .from('products').select('id, stock_rotation').in('id', ids)
  const rotMap = new Map((rots || []).map(r => [r.id, r.stock_rotation || 'FIFO']))
  const earliest = await earliestExpiryByProduct(supabase, entityId, ids)

  return products.map(p => {
    const first = earliest.get(p.id) || null
    return {
      ...p,
      stock_rotation: rotMap.get(p.id) || 'FIFO',
      earliest_batch_expiry: first,
      has_older_batch: hasOlderBatch(p.expires_at, first),
    }
  })
}

/** GET /api/products/sellable — fetch from sellable_products view (+ FEFO context) */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''
    const limit = parseInt(searchParams.get('limit') || '100')
    const supabase = ctx.userClient ?? ctx.supabase

    const query = q.trim()
      ? supabase.from('sellable_products').select(SELECT_FIELDS).or(`name.ilike.%${q}%,sku.ilike.%${q}%`).order('name').limit(50)
      : supabase.from('sellable_products').select(SELECT_FIELDS).order('name').limit(limit)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const products = await enrichFefo(data ?? [], supabase, ctx.entityId)
    return NextResponse.json({ products })
  } catch (err) {
    console.error('[products/sellable] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
