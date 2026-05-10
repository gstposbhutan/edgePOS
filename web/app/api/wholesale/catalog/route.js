import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

// Create a true service client that bypasses RLS
function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const wholesalerId = searchParams.get('wholesaler_id')
    const search = searchParams.get('search') || ''

    if (!wholesalerId) {
      return NextResponse.json({ error: 'wholesaler_id required' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const authClient = createSSRServiceClient()
    const { data: { user }, error: userError } = await authClient.auth.getUser(token)

    if (userError || !user) {
      console.error('[catalog] Auth failed:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let retailerId = user.app_metadata?.entity_id

    // Fallback: if entity_id not in app_metadata (hook not registered), query user_profiles
    if (!retailerId) {
      console.log('[catalog] No entity_id in app_metadata, querying user_profiles')
      const supabase = createBypassClient()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('entity_id')
        .eq('id', user.id)
        .single()

      if (profile) {
        retailerId = profile.entity_id
        console.log('[catalog] Found entity_id from user_profiles:', retailerId)
      } else {
        console.error('[catalog] No profile found for user:', user.id)
        return NextResponse.json({ error: 'No entity' }, { status: 403 })
      }
    }

    // Use bypass client for all queries
    const supabase = createBypassClient()

    // Verify retailer-wholesaler connection
    const { data: connection } = await supabase
      .from('retailer_wholesalers')
      .select('wholesaler_id')
      .eq('retailer_id', retailerId)
      .eq('wholesaler_id', wholesalerId)
      .eq('active', true)
      .limit(1)

    if (!connection || connection.length === 0) {
      return NextResponse.json({ error: 'Not connected to this wholesaler' }, { status: 403 })
    }

    // Fetch wholesaler's products
    let query = supabase
      .from('products')
      .select('id, name, sku, wholesale_price, mrp, unit, current_stock, hsn_code')
      .eq('created_by', wholesalerId)
      .eq('is_active', true)
      .gt('wholesale_price', 0)
      .order('name')

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data: products, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products })
  } catch (err) {
    console.error('Wholesale catalog error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
