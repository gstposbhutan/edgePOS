import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      product_id,
      entity_id,
      quantity,
      unit_cost,
      mrp,
      selling_price,
      batch_number,
      barcode,
      manufactured_at,
      expires_at,
      notes,
    } = body

    // Validate required fields
    if (!product_id)               return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
    if (!entity_id)                return NextResponse.json({ error: 'entity_id is required' }, { status: 400 })
    if (!quantity || quantity <= 0) return NextResponse.json({ error: 'quantity must be greater than 0' }, { status: 400 })
    if (!mrp)                      return NextResponse.json({ error: 'MRP is required' }, { status: 400 })
    if (!selling_price)            return NextResponse.json({ error: 'Selling price is required' }, { status: 400 })

    if (parseFloat(selling_price) > parseFloat(mrp)) {
      return NextResponse.json({ error: 'Selling price cannot exceed MRP' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const batchNo = batch_number?.trim() || `MANUAL-${Date.now()}`

    // Insert the batch
    const { data: batch, error: batchErr } = await serviceClient
      .from('product_batches')
      .insert({
        product_id,
        entity_id,
        batch_number:   batchNo,
        barcode:        barcode?.trim()  || null,
        manufactured_at: manufactured_at || null,
        expires_at:      expires_at      || null,
        quantity:        parseInt(quantity, 10),
        unit_cost:       unit_cost       ? parseFloat(unit_cost)       : null,
        mrp:             parseFloat(mrp),
        selling_price:   parseFloat(selling_price),
        status:          'ACTIVE',
        notes:           notes?.trim()   || null,
      })
      .select()
      .single()

    if (batchErr) {
      if (batchErr.code === '23505') {
        return NextResponse.json({ error: `Batch number "${batchNo}" already exists for this product` }, { status: 409 })
      }
      throw batchErr
    }

    // Insert RESTOCK movement — triggers sync_batch_quantity (sets batch.quantity)
    // and inventory_movement_apply (increments products.current_stock)
    const { error: movErr } = await serviceClient
      .from('inventory_movements')
      .insert({
        product_id,
        entity_id,
        movement_type: 'RESTOCK',
        quantity:       parseInt(quantity, 10),
        batch_id:       batch.id,
        created_by:     session.user.id,
        notes:          `Stock received — batch ${batchNo}`,
      })

    if (movErr) {
      // Compensate: remove the batch we just created
      await serviceClient.from('product_batches').delete().eq('id', batch.id)
      throw movErr
    }

    // Update products with latest prices
    await serviceClient
      .from('products')
      .update({
        mrp:             parseFloat(mrp),
        wholesale_price: unit_cost ? parseFloat(unit_cost) : undefined,
        selling_price:   parseFloat(selling_price),
        updated_at:      new Date().toISOString(),
      })
      .eq('id', product_id)

    return NextResponse.json({ batch, pricesUpdated: true })

  } catch (error) {
    console.error('[inventory/receive]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
