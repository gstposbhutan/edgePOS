import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Set the credit limit on one of the caller's khata accounts (creditor = me). Logs the change.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx
    const { limit, credit_term_days } = await request.json().catch(() => ({}))

    const lim = parseFloat(limit)
    if (!Number.isFinite(lim) || lim < 0) return NextResponse.json({ error: 'Limit must be 0 or more' }, { status: 400 })

    const { data: account } = await supabase
      .from('khata_accounts').select('id, outstanding_balance').eq('id', id).eq('creditor_entity_id', entityId).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const upd = { credit_limit: lim, updated_at: new Date().toISOString() }
    if (credit_term_days != null && Number.isFinite(parseInt(credit_term_days, 10))) upd.credit_term_days = parseInt(credit_term_days, 10)

    const { error } = await supabase.from('khata_accounts').update(upd).eq('id', id).eq('creditor_entity_id', entityId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('khata_transactions').insert({
      khata_account_id: id, transaction_type: 'ADJUSTMENT', amount: 0,
      balance_after: account.outstanding_balance ?? 0, notes: `Credit limit set to Nu. ${lim}`, created_by: userId,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[console/khata/[id]/credit-limit] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
