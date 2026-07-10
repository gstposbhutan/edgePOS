import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Manually adjust a khata balance (creditor = me). WRITE_OFF reduces what's owed; CHARGE adds to it.
// Owner-only — writing off debt is sensitive. Logs an ADJUSTMENT transaction.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.subRole !== 'OWNER') return NextResponse.json({ error: 'Only the owner can adjust a balance' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx
    const { type, amount, reason } = await request.json().catch(() => ({}))

    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    const kind = String(type || '').toUpperCase()
    if (!['WRITE_OFF', 'CHARGE'].includes(kind)) return NextResponse.json({ error: 'type must be WRITE_OFF or CHARGE' }, { status: 400 })
    if (!reason?.trim()) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

    const { data: account } = await supabase
      .from('khata_accounts').select('outstanding_balance').eq('id', id).eq('creditor_entity_id', entityId).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const delta = kind === 'WRITE_OFF' ? -Math.abs(amt) : Math.abs(amt)
    const newBalance = Math.max(0, parseFloat(account.outstanding_balance) + delta)

    const { error: updErr } = await supabase
      .from('khata_accounts').update({ outstanding_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', id).eq('creditor_entity_id', entityId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from('khata_transactions').insert({
      khata_account_id: id, transaction_type: 'ADJUSTMENT', amount: Math.abs(delta), balance_after: newBalance,
      notes: `[${kind}] ${reason.trim()}`, created_by: userId,
    })
    return NextResponse.json({ success: true, newBalance })
  } catch (err) {
    console.error('[console/khata/[id]/adjust] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
