import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/predictions/lead-times — fetch lead times for the current entity */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('supplier_lead_times')
      .select('*, products(name)')
      .eq('entity_id', entityId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leadTimes: data ?? [] })
  } catch (err) {
    console.error('[predictions/lead-times] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/predictions/lead-times — set a lead time (upsert) */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { product_id, supplier_id, lead_time_days, notes } = await request.json()

    const { error } = await supabase
      .from('supplier_lead_times')
      .upsert({
        product_id,
        supplier_id,
        entity_id: entityId,
        lead_time_days,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,supplier_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[predictions/lead-times] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
