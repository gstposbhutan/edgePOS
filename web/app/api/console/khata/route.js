import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Credit (khata) the vendor extends to the tier below — the vendor is the CREDITOR. Lists the
// accounts where creditor_entity_id = the caller (their B2B debtors: a distributor's wholesalers, a
// wholesaler's retailers), enriched with the debtor's business name. OWNER/MANAGER, vendor tiers only.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let q = supabase
      .from('khata_accounts')
      .select('id, debtor_entity_id, debtor_name, party_type, credit_limit, outstanding_balance, credit_term_days, status, last_payment_at, updated_at')
      .eq('creditor_entity_id', entityId)
      .order('outstanding_balance', { ascending: false })
    if (status) q = q.eq('status', status)

    const { data: accounts, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Prefer the linked entity's live name over the stored debtor_name snapshot.
    const ids = [...new Set((accounts || []).map(a => a.debtor_entity_id).filter(Boolean))]
    let nameById = {}
    if (ids.length) {
      const { data: ents } = await supabase.from('entities').select('id, name').in('id', ids)
      nameById = Object.fromEntries((ents || []).map(e => [e.id, e.name]))
    }
    const rows = (accounts || []).map(a => ({ ...a, name: nameById[a.debtor_entity_id] || a.debtor_name || 'Account' }))
    return NextResponse.json({ accounts: rows })
  } catch (err) {
    console.error('[console/khata] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
