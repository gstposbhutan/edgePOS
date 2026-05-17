import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/admin/units — List all units (admin view, includes inactive) */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    const { data, error } = await supabase
      .from('units')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ units: data || [] })
  } catch (err) {
    console.error('Admin units API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/admin/units — Create new unit */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, abbreviation, category } = body

    if (!name || !abbreviation) {
      return NextResponse.json({ error: 'name and abbreviation are required' }, { status: 400 })
    }

    const { supabase } = ctx

    // Get max sort_order
    const { data: lastUnit } = await supabase
      .from('units')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = (lastUnit?.[0]?.sort_order || 0) + 10

    const { data, error } = await supabase
      .from('units')
      .insert({
        name,
        abbreviation,
        category: category || null,
        sort_order: nextSortOrder,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Unit name or abbreviation already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ unit: data }, { status: 201 })
  } catch (err) {
    console.error('Admin units API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
