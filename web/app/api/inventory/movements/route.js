import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/inventory/movements — fetch inventory movements */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')

    let query = supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity, notes, created_at, products(name, sku)')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (productId) query = query.eq('product_id', productId)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ movements: data ?? [] })
  } catch (err) {
    console.error('[inventory/movements] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/inventory/movements — record a manual stock adjustment */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { product_id, movement_type, quantity, notes } = await request.json()

    const { error } = await supabase
      .from('inventory_movements')
      .insert({
        product_id,
        entity_id: entityId,
        movement_type,
        quantity,
        notes,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[inventory/movements] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
