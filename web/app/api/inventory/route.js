import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/inventory — fetch products for inventory management.
 *
 * The active catalog exceeds PostgREST's 1000-row default cap. To make the
 * inventory page work for entities with >1000 products, this endpoint
 * supports a `?search=` parameter that filters by name OR sku ILIKE
 * server-side, returning only matching rows.
 */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx
    const search = new URL(request.url).searchParams.get('search')?.trim() ?? ''

    let query = supabase
      .from('products')
      .select('id, name, sku, unit, current_stock, mrp, selling_price, wholesale_price, hsn_code, is_active, reorder_point, barcode')
      .eq('is_active', true)
      .order('name')

    if (search) {
      const pattern = `%${search.replace(/[%_]/g, '\\$&')}%`
      query = query.or(`name.ilike.${pattern},sku.ilike.${pattern}`)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data ?? [] })
  } catch (err) {
    console.error('[inventory] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
