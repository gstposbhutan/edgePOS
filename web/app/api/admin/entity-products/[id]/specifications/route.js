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

  // Vendors (WHOLESALER, DISTRIBUTOR) can edit their own product specs
  const canEdit = ['WHOLESALER', 'DISTRIBUTOR'].includes(profile.role)

  if (!canEdit) return null

  return { user, profile }
}

/** GET /api/admin/entity-products/[id]/specifications — Get specifications for a vendor product */
export async function GET(request, { params }) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()

    // Verify the entity_product belongs to this vendor
    const { data: entityProduct } = await supabase
      .from('entity_products')
      .select('entity_id')
      .eq('id', params.id)
      .single()

    if (!entityProduct) {
      return NextResponse.json({ error: 'Entity product not found' }, { status: 404 })
    }

    if (entityProduct.entity_id !== authUser.profile.entity_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('entity_product_specifications')
      .select('*, category_properties(*)')
      .eq('entity_product_id', params.id)
      .order('category_properties(sort_order)', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const specifications = (data || []).map(spec => ({
      id: spec.id,
      property_id: spec.property_id,
      property_name: spec.category_properties?.name,
      property_slug: spec.category_properties?.slug,
      data_type: spec.category_properties?.data_type,
      is_required: spec.category_properties?.is_required,
      sort_order: spec.category_properties?.sort_order,
      validation_rules: spec.category_properties?.validation_rules,
      value: getSpecValue(spec),
    }))

    return NextResponse.json({ specifications })
  } catch (err) {
    console.error('Entity product specifications API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/admin/entity-products/[id]/specifications — Save specifications for a vendor product */
export async function POST(request, { params }) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { specifications } = body

    if (!Array.isArray(specifications)) {
      return NextResponse.json({ error: 'specifications must be an array' }, { status: 400 })
    }

    const supabase = createBypassClient()

    // Verify the entity_product belongs to this vendor
    const { data: entityProduct } = await supabase
      .from('entity_products')
      .select('entity_id')
      .eq('id', params.id)
      .single()

    if (!entityProduct) {
      return NextResponse.json({ error: 'Entity product not found' }, { status: 404 })
    }

    if (entityProduct.entity_id !== authUser.profile.entity_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete existing specifications for this entity_product
    await supabase
      .from('entity_product_specifications')
      .delete()
      .eq('entity_product_id', params.id)

    // Insert new specifications
    const specsToInsert = specifications
      .filter(spec => spec.value !== null && spec.value !== undefined && spec.value !== '')
      .map(spec => {
        const row = {
          entity_product_id: params.id,
          property_id: spec.property_id,
        }

        // Set the appropriate value column based on data_type
        switch (spec.data_type) {
          case 'text_single':
          case 'text_multi':
            row.value_text = spec.value
            break
          case 'number':
            row.value_number = parseFloat(spec.value)
            break
          case 'unit':
            row.value_text = spec.value?.value || spec.value
            row.value_unit = spec.value?.unit || null
            break
          case 'datetime':
            row.value_datetime = spec.value
            break
        }

        return row
      })

    let insertedSpecs = []
    if (specsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('entity_product_specifications')
        .insert(specsToInsert)
        .select('*, category_properties(*)')

      if (error) {
        console.error('Insert specifications error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      insertedSpecs = data || []
    }

    const formatted = insertedSpecs.map(spec => ({
      id: spec.id,
      property_id: spec.property_id,
      property_name: spec.category_properties?.name,
      property_slug: spec.category_properties?.slug,
      data_type: spec.category_properties?.data_type,
      is_required: spec.category_properties?.is_required,
      sort_order: spec.category_properties?.sort_order,
      validation_rules: spec.category_properties?.validation_rules,
      value: getSpecValue(spec),
    }))

    return NextResponse.json({ specifications: formatted })
  } catch (err) {
    console.error('Entity product specifications API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper to extract the value based on data_type
function getSpecValue(spec) {
  const { data_type, value_text, value_number, value_unit, value_datetime } = spec

  switch (data_type) {
    case 'text_single':
    case 'text_multi':
      return value_text
    case 'number':
      return value_number
    case 'unit':
      return { value: value_text, unit: value_unit }
    case 'datetime':
      return value_datetime
    default:
      return value_text
  }
}
