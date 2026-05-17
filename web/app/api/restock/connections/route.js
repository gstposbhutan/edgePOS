import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const retailerId = ctx.entityId
    const supabase = ctx.supabase
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
