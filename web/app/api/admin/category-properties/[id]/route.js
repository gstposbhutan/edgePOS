import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

// Create a bypass client for admin operations
function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function getAuthUser(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const authClient = createSSRServiceClient()
  const { data: { user }, error } = await authClient.auth.getUser(token)

  if (error || !user) return null

  const supabase = createBypassClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, entity_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const canManage = profile.role === 'SUPER_ADMIN' || profile.role === 'DISTRIBUTOR'

  if (!canManage) return null

  return { user, profile }
}

/** GET /api/admin/category-properties/[id] — Get single property */
export async function GET(request, { params }) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()
    const { data, error } = await supabase
      .from('category_properties')
      .select('*, categories(id, name)')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    // For DISTRIBUTOR, verify they own this category
    if (authUser.profile.role === 'DISTRIBUTOR') {
      if (data.categories?.distributor_id !== authUser.profile.entity_id) {
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
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First, verify ownership
    const supabase = createBypassClient()
    const { data: existingProp } = await supabase
      .from('category_properties')
      .select('*, categories(id, name, distributor_id)')
      .eq('id', params.id)
      .single()

    if (!existingProp) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // For DISTRIBUTOR, verify they own this category
    if (authUser.profile.role === 'DISTRIBUTOR') {
      if (existingProp.categories?.distributor_id !== authUser.profile.entity_id) {
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
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()

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
    if (authUser.profile.role === 'DISTRIBUTOR') {
      if (existingProp.categories?.distributor_id !== authUser.profile.entity_id) {
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
