import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { ownedWarehouse, ownedProduct, warehouseOnHand } from '@/lib/console/inventory'

// Stock adjustment within a warehouse (vendor consoles): record a gain/loss or reconcile to a counted
// figure. Types: RESTOCK (+), LOSS/DAMAGED (−), or COUNT (set on-hand to a figure → posts the delta).
// Writes a single located inventory_movement; the triggers update warehouse_stock + current_stock.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const SIGNED = { RESTOCK: 1, LOSS: -1, DAMAGED: -1 }

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, userId, supabase } = ctx
    const { product_id, warehouse_id, type, quantity, notes } = await request.json().catch(() => ({}))

    const wh = await ownedWarehouse(supabase, entityId, warehouse_id)
    if (!wh) return NextResponse.json({ error: 'Pick a warehouse' }, { status: 400 })
    const prod = await ownedProduct(supabase, entityId, product_id)
    if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const kind = String(type || '').toUpperCase()
    let movementType, signedQty, note

    if (kind === 'COUNT') {
      const target = parseInt(quantity, 10)
      if (!Number.isFinite(target) || target < 0) return NextResponse.json({ error: 'Counted quantity must be >= 0' }, { status: 400 })
      const current = await warehouseOnHand(supabase, entityId, warehouse_id, product_id)
      const delta = target - current
      if (delta === 0) return NextResponse.json({ ok: true, unchanged: true })
      movementType = delta > 0 ? 'RESTOCK' : 'DAMAGED'
      signedQty = delta
      note = notes || `Stock count: set to ${target} (was ${current})`
    } else if (SIGNED[kind]) {
      const q = parseInt(quantity, 10)
      if (!q || q < 1) return NextResponse.json({ error: 'Quantity must be >= 1' }, { status: 400 })
      movementType = kind
      signedQty = SIGNED[kind] * q
      note = notes || `${kind} adjustment in ${wh.name}`
    } else {
      return NextResponse.json({ error: 'type must be RESTOCK, LOSS, DAMAGED or COUNT' }, { status: 400 })
    }

    const { error } = await supabase.from('inventory_movements').insert({
      product_id, entity_id: entityId, warehouse_id, movement_type: movementType,
      quantity: signedQty, created_by: userId, notes: note,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[console/inventory/adjust] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
