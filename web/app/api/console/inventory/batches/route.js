import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Active batches for the caller, optionally filtered to one warehouse. Ordered by expiry (FEFO view).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouse_id')
    const productId = searchParams.get('product_id')

    let q = supabase
      .from('product_batches')
      .select('id, product_id, warehouse_id, batch_number, quantity, unit_cost, mrp, selling_price, expires_at, received_at, status, products(name, sku)')
      .eq('entity_id', entityId)
      .gt('quantity', 0)
      .order('expires_at', { ascending: true, nullsFirst: false })
      .limit(500)
    if (warehouseId) q = q.eq('warehouse_id', warehouseId)
    if (productId) q = q.eq('product_id', productId)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batches = (data || []).map(b => ({ ...b, product_name: b.products?.name, product_sku: b.products?.sku, products: undefined }))
    return NextResponse.json({ batches })
  } catch (err) {
    console.error('[console/inventory/batches] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
