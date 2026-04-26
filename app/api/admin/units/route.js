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

/** GET /api/admin/units — List all units (admin view, includes inactive) */
export async function GET(request) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createBypassClient()
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
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, abbreviation, category } = body

    if (!name || !abbreviation) {
      return NextResponse.json({ error: 'name and abbreviation are required' }, { status: 400 })
    }

    const supabase = createBypassClient()

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
