import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/admin/category-properties/[id] — Get single property */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canManage = ctx.role === 'SUPER_ADMIN' || ctx.role === 'DISTRIBUTOR'
    if (!canManage) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    const { data, error } = await supabase
      .from('category_properties')
      .select('*, categories(id, name)')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // For DISTRIBUTOR, verify they own this category
    if (ctx.role === 'DISTRIBUTOR') {
      if (data.categories?.distributor_id !== ctx.entityId) {
        return NextResponse.json({ error: 'Unauthorized for this category' }, { status: 403 })
      }
    }

    return NextResponse.json({ property: data })
  } catch (err) {
    console.error('Category property API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/admin/category-properties/[id] — Update property */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canManage = ctx.role === 'SUPER_ADMIN' || ctx.role === 'DISTRIBUTOR'
    if (!canManage) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    // First, verify ownership
    const { data: existingProp } = await supabase
      .from('category_properties')
      .select('*, categories(id, name, distributor_id)')
      .eq('id', params.id)
      .single()

    if (!existingProp) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // For DISTRIBUTOR, verify they own this category
    if (ctx.role === 'DISTRIBUTOR') {
      if (existingProp.categories?.distributor_id !== ctx.entityId) {
        return NextResponse.json({ error: 'Unauthorized for this category' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { name, data_type, is_required, validation_rules, sort_order } = body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (data_type !== undefined) {
      const validTypes = ['text_single', 'text_multi', 'number', 'unit', 'datetime']
      if (!validTypes.includes(data_type)) {
        return NextResponse.json({
          error: `data_type must be one of: ${validTypes.join(', ')}`
        }, { status: 400 })
      }
      updateData.data_type = data_type
    }
    if (is_required !== undefined) updateData.is_required = is_required
    if (validation_rules !== undefined) updateData.validation_rules = validation_rules
    if (sort_order !== undefined) updateData.sort_order = sort_order

    const { data, error } = await supabase
      .from('category_properties')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ property: data })
  } catch (err) {
    console.error('Category property API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/admin/category-properties/[id] — Delete property */
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canManage = ctx.role === 'SUPER_ADMIN' || ctx.role === 'DISTRIBUTOR'
    if (!canManage) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    // First, verify ownership
    const { data: existingProp } = await supabase
      .from('category_properties')
      .select('*, categories(id, name, distributor_id)')
      .eq('id', params.id)
      .single()

    if (!existingProp) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // For DISTRIBUTOR, verify they own this category
    if (ctx.role === 'DISTRIBUTOR') {
      if (existingProp.categories?.distributor_id !== ctx.entityId) {
        return NextResponse.json({ error: 'Unauthorized for this category' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('category_properties')
      .delete()
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Category property API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
