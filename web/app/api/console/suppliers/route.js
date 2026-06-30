import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// The distributors a wholesaler can restock from — the analogue of /api/restock/connections one
// tier up. Lists the distributors linked to me via distributor_wholesalers (active only), joined
// to their business name. Wholesaler-only; the order flow is the wholesaler buying from a
// distributor, so distributors don't have suppliers in this model.

/** GET /api/console/suppliers — distributors linked to this wholesaler. */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (ctx.role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers have distributor suppliers' }, { status: 403 })
    }

    const { entityId, supabase } = ctx

    const { data: links, error } = await supabase
      .from('distributor_wholesalers')
      .select('distributor_id, is_primary, active, category_id, categories(name)')
      .eq('wholesaler_id', entityId)
      .eq('active', true)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const distributorIds = (links || []).map(l => l.distributor_id)
    let suppliers = []
    if (distributorIds.length) {
      const { data: entities } = await supabase
        .from('entities')
        .select('id, name, whatsapp_no')
        .in('id', distributorIds)
      const byId = Object.fromEntries((entities || []).map(e => [e.id, e]))
      suppliers = (links || []).map(l => ({
        id: l.distributor_id,
        name: byId[l.distributor_id]?.name || 'Unknown',
        whatsapp_no: byId[l.distributor_id]?.whatsapp_no || '',
        is_primary: l.is_primary,
        category: l.categories?.name || '',
      }))
    }

    return NextResponse.json({ suppliers })
  } catch (err) {
    console.error('[console/suppliers] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
