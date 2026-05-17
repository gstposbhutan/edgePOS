import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/predictions/mine — fetch predictions for the current entity (cookie auth) */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')

    // Get latest calculated_at
    const { data: latest } = await supabase
      .from('stock_predictions')
      .select('calculated_at')
      .eq('entity_id', entityId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    if (!latest) {
      return NextResponse.json({
        calculated_at: null,
        predictions: [],
        summary: { critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0, error: 0 },
      })
    }

    // Fetch predictions
    let query = supabase
      .from('stock_predictions')
      .select(`*, products(name, sku, current_stock, reorder_point)`)
      .eq('entity_id', entityId)
      .eq('calculated_at', latest.calculated_at)
      .order('days_until_stockout', { ascending: true, nullsFirst: false })

    if (statusFilter) {
      query = query.in('status', statusFilter.split(','))
    }

    const { data: predictions, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Compute summary
    const summary = { critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0, error: 0 }
    for (const p of (predictions ?? [])) {
      const key = p.status.toLowerCase()
      if (key in summary) summary[key]++
    }

    return NextResponse.json({
      calculated_at: latest.calculated_at,
      predictions: predictions ?? [],
      summary,
    })
  } catch (err) {
    console.error('[predictions/mine] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/predictions/mine — refresh predictions for current entity */
export async function POST() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx

    const { error } = await supabase.rpc('calculate_stock_predictions', {
      p_entity_id: entityId,
    })

    if (error) {
      console.error('Prediction calculation error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[predictions/mine] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
