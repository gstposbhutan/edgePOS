import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Record a repayment against one of the caller's khata accounts (the debtor paid). Inserts a CREATED
// repayment then confirms it (→ PAYMENT_MADE), which fires khata_apply_repayment to reduce the
// balance, log a CREDIT txn, and auto-unfreeze if now under the limit.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const METHODS = ['CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx
    const { amount, payment_method, reference_no, notes } = await request.json().catch(() => ({}))

    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    const method = String(payment_method || 'CASH').toUpperCase()
    if (!METHODS.includes(method)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })

    // Ownership: the account must be one this vendor extends (creditor = me).
    const { data: account } = await supabase
      .from('khata_accounts').select('id').eq('id', id).eq('creditor_entity_id', entityId).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const { data: repayment, error } = await supabase
      .from('khata_repayments')
      .insert({ khata_account_id: id, amount: amt, payment_method: method, status: 'CREATED', reference_no: reference_no || null, notes: notes || null, created_by: userId })
      .select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { error: confErr } = await supabase
      .from('khata_repayments')
      .update({ status: 'PAYMENT_MADE', confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq('id', repayment.id)
    if (confErr) return NextResponse.json({ error: confErr.message }, { status: 500 })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[console/khata/[id]/payment] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
