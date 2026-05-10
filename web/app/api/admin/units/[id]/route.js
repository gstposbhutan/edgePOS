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

  // Check if user is SUPER_ADMIN
  const supabase = createBypassClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, entity_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'SUPER_ADMIN') return null

  return { user, profile }
}

/** GET /api/admin/units/[id] — Get single unit */
export async function GET(request, { params }) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()
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
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, abbreviation, category, is_active, sort_order } = body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (abbreviation !== undefined) updateData.abbreviation = abbreviation
    if (category !== undefined) updateData.category = category
    if (is_active !== undefined) updateData.is_active = is_active
    if (sort_order !== undefined) updateData.sort_order = sort_order

    const supabase = createBypassClient()
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
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()

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
