import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const SELECT_FIELDS = 'id, name, sku, hsn_code, image_url, available_stock, wholesale_price, mrp, selling_price, unit, product_type, package_type, package_def_id, package_barcode, reorder_point, batch_id, batch_number, expires_at, batch_barcode'

/** GET /api/products/sellable — fetch from sellable_products view */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''
    const limit = parseInt(searchParams.get('limit') || '100')
    const supabase = ctx.supabase

    if (!q.trim()) {
      const { data, error } = await supabase
        .from('sellable_products')
        .select(SELECT_FIELDS)
        .order('name')
        .limit(limit)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ products: data ?? [] })
    }

    const { data, error } = await supabase
      .from('sellable_products')
      .select(SELECT_FIELDS)
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .order('name')
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data ?? [] })
  } catch (err) {
    console.error('[products/sellable] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
