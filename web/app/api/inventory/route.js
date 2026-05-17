import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/inventory — fetch products for inventory management */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, unit, current_stock, mrp, selling_price, wholesale_price, hsn_code, is_active, reorder_point, barcode')
      .eq('is_active', true)
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data ?? [] })
  } catch (err) {
    console.error('[inventory] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
