import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

// Create a bypass client for reads
function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/** GET /api/entity-products/[id]/specifications — Get specifications for a vendor product */
export async function GET(request, { params }) {
  try {
    const supabase = createBypassClient()

    const { data, error } = await supabase
      .from('entity_product_specifications')
      .select('*, category_properties(*)')
      .eq('entity_product_id', params.id)
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Format the response
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
