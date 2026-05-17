import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/inventory/batches — fetch active batches */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')

    let query = supabase
      .from('product_batches')
      .select('id, product_id, batch_number, barcode, manufactured_at, expires_at, quantity, unit_cost, mrp, selling_price, status, received_at, products(name, sku, unit)')
      .eq('entity_id', entityId)
      .order('expires_at', { ascending: true, nullsFirst: false })

    if (productId) query = query.eq('product_id', productId)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ batches: data ?? [] })
  } catch (err) {
    console.error('[inventory/batches] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
