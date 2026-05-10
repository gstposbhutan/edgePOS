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
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const authClient = createSSRServiceClient()
    const { data: { user }, error: userError } = await authClient.auth.getUser(token)

    if (userError || !user) {
      console.error('[connections] Auth failed:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let retailerId = user.app_metadata?.entity_id

    // Fallback: if entity_id not in app_metadata (hook not registered), query user_profiles
    if (!retailerId) {
      console.log('[connections] No entity_id in app_metadata, querying user_profiles')
      const supabase = createBypassClient()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('entity_id')
        .eq('id', user.id)
        .single()

      if (profile) {
        retailerId = profile.entity_id
        console.log('[connections] Found entity_id from user_profiles:', retailerId)
      } else {
        console.error('[connections] No profile found for user:', user.id)
        return NextResponse.json({ error: 'No entity' }, { status: 403 })
      }
    }

    // Use bypass client to read connections and wholesaler entities without RLS
    const supabase = createBypassClient()
    const { data: connections, error: connErr } = await supabase
      .from('retailer_wholesalers')
      .select('wholesaler_id, is_primary, active, category_id, categories(name)')
      .eq('retailer_id', retailerId)
      .eq('active', true)

    if (connErr) {
      console.error('[connections] Query error:', connErr)
      return NextResponse.json({ error: connErr.message }, { status: 500 })
    }

    console.log('[connections] Found', connections?.length || 0, 'connections for retailer:', retailerId)

    // Fetch wholesaler entity details using bypass client
    const wholesalerIds = (connections || []).map(c => c.wholesaler_id)
    let wholesalers = []
    if (wholesalerIds.length > 0) {
      const { data: entities } = await supabase
        .from('entities')
        .select('id, name, whatsapp_no')
        .in('id', wholesalerIds)

      const wholesalerMap = Object.fromEntries((entities || []).map(e => [e.id, e]))
      wholesalers = (connections || []).map(c => ({
        id: c.wholesaler_id,
        name: wholesalerMap[c.wholesaler_id]?.name || 'Unknown',
        whatsapp_no: wholesalerMap[c.wholesaler_id]?.whatsapp_no || '',
        is_primary: c.is_primary,
        category: c.categories?.name || '',
      }))
    }

    return NextResponse.json({ connections: wholesalers })
  } catch (err) {
    console.error('Restock connections error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
