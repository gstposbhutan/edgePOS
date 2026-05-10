import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const status = searchParams.get('status')

    if (!entityId) {
      return NextResponse.json({ error: 'entity_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get latest batch
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
        summary: { critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0 },
        predictions: [],
      })
    }

    // Fetch predictions
    let query = supabase
      .from('stock_predictions')
      .select(`*, products(name, sku, current_stock, reorder_point)`)
      .eq('entity_id', entityId)
      .eq('calculated_at', latest.calculated_at)
      .order('days_until_stockout', { ascending: true, nullsFirst: false })

    if (status) {
      query = query.in('status', status.split(','))
    }

    const { data: predictions } = query

    // Compute summary
    const summary = { critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0, error: 0 }
    for (const p of (predictions ?? [])) {
      const key = p.status.toLowerCase()
      if (key in summary) summary[key]++
    }

    return NextResponse.json({
      calculated_at: latest.calculated_at,
      summary,
      predictions: predictions ?? [],
    })
  } catch (err) {
    console.error('Predictions GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { entity_id } = await request.json()

    if (!entity_id) {
      return NextResponse.json({ error: 'entity_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase.rpc('calculate_stock_predictions', {
      p_entity_id: entity_id,
    })

    if (error) {
      console.error('Prediction calculation error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Predictions calculated' })
  } catch (err) {
    console.error('Predictions POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
