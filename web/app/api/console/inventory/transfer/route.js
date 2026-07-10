import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { ownedWarehouse, ownedProduct, warehouseOnHand } from '@/lib/console/inventory'

// Move stock between two of the caller's own warehouses. A transfer is a pair of located TRANSFER
// movements (−qty at the source, +qty at the destination) sharing a reference_id; the triggers move
// warehouse_stock between the two and leave products.current_stock (the entity total) unchanged.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, userId, supabase } = ctx
    const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = await request.json().catch(() => ({}))

    const qty = parseInt(quantity, 10)
    if (!qty || qty < 1) return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })
    if (!from_warehouse_id || !to_warehouse_id) return NextResponse.json({ error: 'Source and destination warehouses are required' }, { status: 400 })
    if (from_warehouse_id === to_warehouse_id) return NextResponse.json({ error: 'Source and destination must differ' }, { status: 400 })

    const [from, to, prod] = await Promise.all([
      ownedWarehouse(supabase, entityId, from_warehouse_id),
      ownedWarehouse(supabase, entityId, to_warehouse_id),
      ownedProduct(supabase, entityId, product_id),
    ])
    if (!from || !to) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const onHand = await warehouseOnHand(supabase, entityId, from_warehouse_id, product_id)
    if (onHand < qty) return NextResponse.json({ error: `Only ${onHand} in ${from.name}` }, { status: 400 })

    const ref = crypto.randomUUID()
    const note = notes || `Transfer ${from.name} → ${to.name}`
    const { error } = await supabase.from('inventory_movements').insert([
      { product_id, entity_id: entityId, warehouse_id: from_warehouse_id, movement_type: 'TRANSFER', quantity: -qty, reference_id: ref, created_by: userId, notes: note },
      { product_id, entity_id: entityId, warehouse_id: to_warehouse_id, movement_type: 'TRANSFER', quantity: qty, reference_id: ref, created_by: userId, notes: note },
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reference_id: ref }, { status: 201 })
  } catch (err) {
    console.error('[console/inventory/transfer] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
