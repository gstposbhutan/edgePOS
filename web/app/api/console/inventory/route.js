import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Warehouse-scoped stock levels for the vendor consoles. With ?warehouse_id, returns each product's
// on-hand in that warehouse (from warehouse_stock); without it, the entity total (products.current_stock).
// reorder_point rides along so the client can flag low/out. OWNER/MANAGER, vendor tiers only.
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
    const search = (searchParams.get('search') || '').trim()

    if (warehouseId) {
      const { data: wh } = await supabase.from('warehouses').select('id').eq('id', warehouseId).eq('entity_id', entityId).maybeSingle()
      if (!wh) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    let q = supabase
      .from('products')
      .select('id, name, sku, unit, current_stock, reorder_point, wholesale_price, mrp, distributor_price, product_type, is_active')
      .eq('created_by', entityId)
      .eq('is_active', true)
      .order('name')
    if (search) q = q.ilike('name', `%${search}%`)
    const { data: products, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let byProduct = {}
    if (warehouseId) {
      const { data: ws } = await supabase
        .from('warehouse_stock').select('product_id, quantity')
        .eq('warehouse_id', warehouseId).eq('entity_id', entityId)
      byProduct = Object.fromEntries((ws || []).map(w => [w.product_id, w.quantity]))
    }

    const rows = (products || []).map(p => ({
      ...p,
      // On-hand in the selected warehouse, or the entity total when no warehouse is chosen.
      on_hand: warehouseId ? (byProduct[p.id] ?? 0) : p.current_stock,
      scope: warehouseId ? 'WAREHOUSE' : 'ENTITY',
    }))
    return NextResponse.json({ products: rows })
  } catch (err) {
    console.error('[console/inventory] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
