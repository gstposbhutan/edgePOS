import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/** GET /api/units — List all active units (for dropdowns) */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('include_inactive') === 'true'

    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    let query = supabase
      .from('units')
      .select('*')
      .order('sort_order', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ units: data || [] })
  } catch (err) {
    console.error('Units API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
