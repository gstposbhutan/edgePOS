import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Recent stock movements for the caller, optionally filtered by warehouse / product. Read-only log.
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 300)

    let q = supabase
      .from('inventory_movements')
      .select('id, product_id, warehouse_id, movement_type, quantity, notes, created_at, products(name, sku)')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (warehouseId) q = q.eq('warehouse_id', warehouseId)
    if (productId) q = q.eq('product_id', productId)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Warehouse names for display.
    const whIds = [...new Set((data || []).map(m => m.warehouse_id).filter(Boolean))]
    let whName = {}
    if (whIds.length) {
      const { data: whs } = await supabase.from('warehouses').select('id, name').in('id', whIds)
      whName = Object.fromEntries((whs || []).map(w => [w.id, w.name]))
    }
    const movements = (data || []).map(m => ({
      ...m, product_name: m.products?.name, product_sku: m.products?.sku,
      warehouse_name: m.warehouse_id ? (whName[m.warehouse_id] || null) : null, products: undefined,
    }))
    return NextResponse.json({ movements })
  } catch (err) {
    console.error('[console/inventory/movements] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
