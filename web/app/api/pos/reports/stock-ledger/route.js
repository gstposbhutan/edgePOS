import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/reports/stock-ledger?product_id=&from=&to=
 *
 * A product's movement history as a ledger: what it opened the period holding, every movement in
 * order, and the balance carried down after each one.
 *
 * This is NOT /api/inventory/movements with a filter. That endpoint answers "what happened
 * lately" — newest first, capped at 50, no period. A ledger has to answer "how did it get to
 * this number", which needs the opposite order, the whole period, and an OPENING balance summed
 * from everything before the period started. Reading a ledger without its opening balance tells
 * you the movements and lies about the running total.
 *
 * `quantity` is signed in this table (RESTOCK/RETURN positive, SALE/DAMAGED/LOSS negative, OPEN
 * both ways when a bulk package is broken), so the balance is a plain cumulative sum.
 */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!productId) return NextResponse.json({ error: 'product_id is required' }, { status: 400 })

    // Opening balance: everything that happened before the window, in one sum.
    let openingQty = 0
    if (from) {
      const { data: prior, error: priorErr } = await supabase
        .from('inventory_movements')
        .select('quantity')
        .eq('entity_id', entityId)
        .eq('product_id', productId)
        .lt('created_at', from)
      if (priorErr) return NextResponse.json({ error: priorErr.message }, { status: 500 })
      openingQty = (prior ?? []).reduce((sum, m) => sum + Number(m.quantity ?? 0), 0)
    }

    let query = supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity, notes, reference_id, created_at')
      .eq('entity_id', entityId)
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let balance = openingQty
    let totalIn = 0
    let totalOut = 0
    const rows = (data ?? []).map(m => {
      const qty = Number(m.quantity ?? 0)
      balance += qty
      if (qty >= 0) totalIn += qty; else totalOut += Math.abs(qty)
      return {
        id: m.id,
        date: m.created_at,
        type: m.movement_type,
        notes: m.notes ?? null,
        reference_id: m.reference_id ?? null,
        in_qty: qty >= 0 ? qty : null,
        out_qty: qty < 0 ? Math.abs(qty) : null,
        balance,
      }
    })

    const { data: product } = await supabase
      .from('products')
      .select('name, sku, unit')
      .eq('id', productId)
      .single()

    return NextResponse.json({
      product: product ?? null,
      opening: openingQty,
      closing: balance,
      totals: { in: totalIn, out: totalOut },
      rows,
    })
  } catch (err) {
    console.error('[reports/stock-ledger] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
