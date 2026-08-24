import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/reports/cash-book?from=&to=
 *
 * The drawer's own ledger: cash in, cash out, and the balance carried down.
 *
 * Only CASH belongs here. A credit sale and an online transfer are revenue but they never touch
 * the drawer, so including them would produce a "cash balance" that no amount of counting could
 * ever match. Two sources feed it: takings (shift_transactions where the method was cash) and
 * drawer movements (cash_adjustments — float in, drops and pay-outs).
 */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // Takings, restricted to the shifts this entity owns.
    const { data: shifts, error: shiftErr } = await supabase
      .from('shifts')
      .select('id, register_id')
      .eq('entity_id', entityId)
    if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 })
    const shiftIds = (shifts ?? []).map(s => s.id)

    let takings = []
    if (shiftIds.length) {
      let q = supabase
        .from('shift_transactions')
        .select('id, shift_id, transaction_type, payment_method, amount, created_at')
        .in('shift_id', shiftIds)
        .eq('payment_method', 'CASH')
        .order('created_at', { ascending: true })
      if (from) q = q.gte('created_at', from)
      if (to)   q = q.lte('created_at', to)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      takings = data ?? []
    }

    let adjQ = supabase
      .from('cash_adjustments')
      .select('id, type, amount, reason, notes, created_at')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
    if (from) adjQ = adjQ.gte('created_at', from)
    if (to)   adjQ = adjQ.lte('created_at', to)
    const { data: adjustments, error: adjErr } = await adjQ
    if (adjErr) return NextResponse.json({ error: adjErr.message }, { status: 500 })

    // One stream, in time order, so the balance means something as it is read down.
    const entries = [
      ...takings.map(t => ({
        id: `t-${t.id}`,
        at: t.created_at,
        particulars: t.transaction_type === 'SALE' ? 'Cash sale' : (t.transaction_type || 'Takings'),
        note: null,
        amount: parseFloat(t.amount ?? 0),          // takings are money in
      })),
      ...(adjustments ?? []).map(a => ({
        id: `a-${a.id}`,
        at: a.created_at,
        particulars: a.type === 'CASH_IN' ? 'Cash in' : a.type === 'CASH_OUT' ? 'Cash out' : (a.type || 'Adjustment'),
        note: a.reason || a.notes || null,
        // CASH_OUT is stored positive; direction lives in the type, not the sign.
        amount: a.type === 'CASH_OUT' ? -Math.abs(parseFloat(a.amount ?? 0)) : Math.abs(parseFloat(a.amount ?? 0)),
      })),
    ].sort((x, y) => new Date(x.at) - new Date(y.at))

    let balance = 0
    let totalIn = 0
    let totalOut = 0
    const rows = entries.map(e => {
      balance += e.amount
      if (e.amount >= 0) totalIn += e.amount; else totalOut += Math.abs(e.amount)
      return {
        id: e.id,
        date: e.at,
        particulars: e.particulars,
        note: e.note,
        in_amt: e.amount >= 0 ? e.amount : null,
        out_amt: e.amount < 0 ? Math.abs(e.amount) : null,
        balance,
      }
    })

    return NextResponse.json({ rows, totals: { in: totalIn, out: totalOut }, closing: balance })
  } catch (err) {
    console.error('[reports/cash-book] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
