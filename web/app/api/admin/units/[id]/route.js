import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/admin/units/[id] — Get single unit */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    return NextResponse.json({ unit: data })
  } catch (err) {
    console.error('Admin unit API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/admin/units/[id] — Update unit */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, abbreviation, category, is_active, sort_order } = body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (abbreviation !== undefined) updateData.abbreviation = abbreviation
    if (category !== undefined) updateData.category = category
    if (is_active !== undefined) updateData.is_active = is_active
    if (sort_order !== undefined) updateData.sort_order = sort_order

    const { supabase } = ctx

    const { data, error } = await supabase
      .from('units')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Unit name or abbreviation already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    return NextResponse.json({ unit: data })
  } catch (err) {
    console.error('Admin unit API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/admin/units/[id] — Delete unit */
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    // Check if unit is being used in any category_properties
    const { data: propertiesUsingUnit } = await supabase
      .from('category_properties')
      .select('id')
      .contains('validation_rules', JSON.stringify(params.id))
      .limit(1)

    if (propertiesUsingUnit && propertiesUsingUnit.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete unit that is in use by category properties'
      }, { status: 409 })
    }

    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin unit API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
