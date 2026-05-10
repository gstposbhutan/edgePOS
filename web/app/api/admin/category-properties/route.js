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

  // SUPER_ADMIN can do everything, DISTRIBUTOR can only manage their categories
  const canManage = profile.role === 'SUPER_ADMIN' || profile.role === 'DISTRIBUTOR'

  if (!canManage) return null

  return { user, profile }
}

/** GET /api/admin/category-properties — List properties (optionally filtered by category or HSN code) */
export async function GET(request) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('category_id')
    const hsnCode = searchParams.get('hsn_code')

    const supabase = createBypassClient()

    let properties = []

    // If HSN code provided, use HSN-based property lookup
    if (hsnCode) {
      const { data: hsnProps, error: hsnError } = await supabase.rpc('get_hsn_properties', {
        p_hsn_code: hsnCode
      })

      if (hsnError) {
        console.error('[CategoryProperties] HSN lookup error:', hsnError)
        return NextResponse.json({ error: hsnError.message }, { status: 500 })
      }

      properties = hsnProps || []
    } else {
      // Legacy category_id based lookup
      let query = supabase
        .from('category_properties')
        .select('*, categories(id, name)')
        .order('sort_order', { ascending: true })

      if (categoryId) {
        query = query.eq('category_id', categoryId)
      }

      // If DISTRIBUTOR, only show properties for their categories
      if (authUser.profile.role === 'DISTRIBUTOR') {
        query = query.over('categories', 'distributor_id', authUser.profile.entity_id)
      }

      const { data, error } = await query

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      properties = data || []
    }

    return NextResponse.json({ properties })
  } catch (err) {
    console.error('Category properties API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/admin/category-properties — Create new property */
export async function POST(request) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { category_id, name, slug, data_type, is_required, validation_rules } = body

    if (!category_id || !name || !slug || !data_type) {
      return NextResponse.json({
        error: 'category_id, name, slug, and data_type are required'
      }, { status: 400 })
    }

    // Validate data_type
    const validTypes = ['text_single', 'text_multi', 'number', 'unit', 'datetime']
    if (!validTypes.includes(data_type)) {
      return NextResponse.json({
        error: `data_type must be one of: ${validTypes.join(', ')}`
      }, { status: 400 })
    }

    // For DISTRIBUTOR, verify they own this category
    if (authUser.profile.role === 'DISTRIBUTOR') {
      const supabase = createBypassClient()
      const { data: category } = await supabase
        .from('categories')
        .select('distributor_id')
        .eq('id', category_id)
        .single()

      if (!category || category.distributor_id !== authUser.profile.entity_id) {
        return NextResponse.json({ error: 'Unauthorized for this category' }, { status: 403 })
      }
    }

    // Generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

    const supabase = createBypassClient()

    // Get max sort_order for this category
    const { data: lastProp } = await supabase
      .from('category_properties')
      .select('sort_order')
      .eq('category_id', category_id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = (lastProp?.[0]?.sort_order || 0) + 10

    const { data, error } = await supabase
      .from('category_properties')
      .insert({
        category_id,
        name,
        slug: finalSlug,
        data_type,
        is_required: is_required || false,
        validation_rules: validation_rules || {},
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Property with this slug already exists for this category' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ property: data }, { status: 201 })
  } catch (err) {
    console.error('Category properties API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
