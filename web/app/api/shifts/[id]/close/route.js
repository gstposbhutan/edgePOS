import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// POST /api/shifts/[id]/close — blind close
export async function POST(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, userId, supabase } = ctx
  const { id } = await params
  const body = await request.json()

  const closing_count = parseFloat(body.closing_count)
  if (isNaN(closing_count) || closing_count < 0) {
    return NextResponse.json({ error: 'Closing count must be >= 0' }, { status: 400 })
  }

  // Fetch shift
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, entity_id, opening_float, status, opened_at')
    .eq('id', id)
    .single()

  if (shiftErr || !shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.entity_id !== entityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (shift.status === 'CLOSED') return NextResponse.json({ error: 'Shift already closed' }, { status: 409 })

  // Calculate expected total: opening float + CASH sales − CASH refunds + cash in − cash out.
  // Matches the desktop close math (desktop/hooks/use-shifts.ts) so a terminal and the
  // web reconcile the same drawer figure. Only CASH refunds leave the drawer.
  const { data: txns } = await supabase
    .from('shift_transactions')
    .select('transaction_type, payment_method, amount')
    .eq('shift_id', id)

  let cash_sales = 0
  let cash_refunds = 0
  let total_transactions = 0

  for (const t of txns || []) {
    total_transactions++
    if (t.transaction_type === 'SALE' && t.payment_method === 'CASH') {
      cash_sales += parseFloat(t.amount)
    } else if (t.transaction_type === 'REFUND' && t.payment_method === 'CASH') {
      cash_refunds += parseFloat(t.amount)
    }
  }

  // Cash drawer adjustments (cash in/out) recorded against this shift.
  const { data: adjs } = await supabase
    .from('cash_adjustments')
    .select('type, amount')
    .eq('shift_id', id)

  let total_cash_in = 0
  let total_cash_out = 0
  for (const a of adjs || []) {
    if (a.type === 'CASH_IN') total_cash_in += parseFloat(a.amount)
    else total_cash_out += parseFloat(a.amount)
  }

  const expected_total =
    parseFloat(shift.opening_float) + cash_sales - cash_refunds + total_cash_in - total_cash_out
  const discrepancy = closing_count - expected_total

  let classification = 'BALANCED'
  if (discrepancy > 0) classification = 'OVERAGE'
  else if (discrepancy < 0) classification = 'SHORTAGE'

  // Update shift
  const { error: updateErr } = await supabase
    .from('shifts')
    .update({
      status: 'CLOSED',
      closed_by: userId,
      closed_at: new Date().toISOString(),
      closing_count,
      expected_total,
      discrepancy,
    })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Insert reconciliation
  await supabase.from('shift_reconciliations').insert({
    shift_id: id,
    expected_total,
    actual_count: closing_count,
    discrepancy,
    classification,
  })

  // CASHIER gets blind response
  const response = {
    shift_id: id,
    closed_at: new Date().toISOString(),
    status: 'CLOSED',
    message: 'Shift closed. Report sent to owner.',
  }

  // MANAGER/OWNER get full reconciliation
  if (['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    response.expected_total = expected_total
    response.closing_count = closing_count
    response.discrepancy = discrepancy
    response.classification = classification
    response.total_transactions = total_transactions
    response.cash_sales = cash_sales
    response.cash_refunds = cash_refunds
    response.total_cash_in = total_cash_in
    response.total_cash_out = total_cash_out
  }

  return NextResponse.json(response)
}
