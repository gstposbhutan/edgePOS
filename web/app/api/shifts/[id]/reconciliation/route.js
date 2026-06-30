import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET /api/shifts/[id]/reconciliation — live drawer reconciliation for an open shift,
// so the end-shift modal can preview expected cash BEFORE the cashier counts it.
//
// Manager/owner only: returns 403 for CASHIER, which the modal treats as "stay blind"
// (the cashier must count cash without seeing the expected figure — anti-shrinkage).
// Uses the SAME arithmetic as the close route, so preview == final.

export async function GET(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params

  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, entity_id, opening_float, status')
    .eq('id', id)
    .single()

  if (shiftErr || !shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.entity_id !== entityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { data: txns } = await supabase
    .from('shift_transactions')
    .select('transaction_type, payment_method, amount')
    .eq('shift_id', id)

  const { data: adjs } = await supabase
    .from('cash_adjustments')
    .select('type, amount')
    .eq('shift_id', id)

  let cash_sales = 0
  let cash_refunds = 0
  let credit_sales = 0
  let digital_sales = 0
  let transaction_count = 0

  for (const t of txns || []) {
    transaction_count++
    if (t.transaction_type === 'SALE') {
      if (t.payment_method === 'CASH') cash_sales += parseFloat(t.amount)
      else if (t.payment_method === 'CREDIT') credit_sales += parseFloat(t.amount)
      else digital_sales += parseFloat(t.amount)
    } else if (t.transaction_type === 'REFUND' && t.payment_method === 'CASH') {
      cash_refunds += parseFloat(t.amount)
    }
  }

  let total_cash_in = 0
  let total_cash_out = 0
  for (const a of adjs || []) {
    if (a.type === 'CASH_IN') total_cash_in += parseFloat(a.amount)
    else total_cash_out += parseFloat(a.amount)
  }

  const expected_total =
    parseFloat(shift.opening_float) + cash_sales - cash_refunds + total_cash_in - total_cash_out

  return NextResponse.json({
    opening_float: parseFloat(shift.opening_float),
    cash_sales,
    cash_refunds,
    total_cash_in,
    total_cash_out,
    expected_total,
    transaction_count,
    payment_breakdown: { cash: cash_sales, credit: credit_sales, digital: digital_sales },
  })
}
