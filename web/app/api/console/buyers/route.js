import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { linkLookup } from '@/lib/console/supply-links'

// Downstream buyers a vendor can sell to (the buyer-picker for seller-initiated sales):
//   DISTRIBUTOR → its linked WHOLESALERs   (distributor_wholesalers)
//   WHOLESALER  → its linked RETAILERs     (retailer_wholesalers)
// Any active link counts (category-scoped or whole-catalog), deduped to one row per buyer.
const DOWNSTREAM = { DISTRIBUTOR: 'WHOLESALER', WHOLESALER: 'RETAILER' }

/** GET /api/console/buyers — active downstream buyers with contact + outstanding-credit info. */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, role, supabase } = ctx
    const targetRole = DOWNSTREAM[role]
    const lk = targetRole ? linkLookup(role, targetRole) : null
    if (!lk) return NextResponse.json({ buyers: [] })

    const { data: links, error } = await supabase
      .from(lk.table)
      .select(lk.other)
      .eq(lk.self, entityId)
      .eq('active', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = [...new Set((links ?? []).map(r => r[lk.other]).filter(Boolean))]
    if (!ids.length) return NextResponse.json({ buyers: [] })

    const [{ data: entities }, { data: khatas }] = await Promise.all([
      supabase.from('entities').select('id, name, role, whatsapp_no, address').in('id', ids),
      supabase.from('khata_accounts')
        .select('debtor_entity_id, credit_limit, outstanding_balance, status')
        .eq('creditor_entity_id', entityId).in('debtor_entity_id', ids),
    ])
    const khataBy = Object.fromEntries((khatas ?? []).map(k => [k.debtor_entity_id, k]))

    const buyers = (entities ?? []).map(e => ({
      id: e.id, name: e.name, role: e.role, whatsapp_no: e.whatsapp_no, address: e.address,
      credit_limit: khataBy[e.id]?.credit_limit ?? null,
      outstanding_balance: khataBy[e.id]?.outstanding_balance ?? null,
      khata_status: khataBy[e.id]?.status ?? null,
    })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    return NextResponse.json({ buyers })
  } catch (err) {
    console.error('[console/buyers] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
