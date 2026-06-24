import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET /api/shifts/z-report?date=YYYY-MM-DD — daily end-of-day Z-report (desktop
// getZReport parity). Entity-scoped, manager/owner/admin only.
//
// Sales come from `orders` (status CONFIRMED) for the day; refunds come from
// `shift_transactions` (REFUND) recorded that day, since `orders` has no refund_amount
// column. Day boundaries are in Bhutan time (Asia/Thimphu, UTC+6, no DST).

const BTT_OFFSET_MIN = 6 * 60 // +06:00

function bhutanToday() {
  // Wall-clock date in UTC+6.
  return new Date(Date.now() + BTT_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

function dayRange(date) {
  // [start, nextStart) as ISO strings; compare against timestamptz.
  const start = new Date(date + 'T00:00:00+06:00')
  const next = new Date(start)
  next.setUTCDate(start.getUTCDate() + 1)
  return { start: start.toISOString(), end: next.toISOString() }
}

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { entityId, subRole, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || bhutanToday()
  const { start, end } = dayRange(date)

  // Confirmed sales for the day (POS sales stay status=CONFIRMED).
  const { data: sales, error: salesErr } = await supabase
    .from('orders')
    .select('subtotal, gst_total, grand_total, payment_method')
    .eq('seller_id', entityId)
    .eq('status', 'CONFIRMED')
    .gte('created_at', start)
    .lt('created_at', end)

  if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 })

  let grossSales = 0
  let subtotal = 0
  let gstTotal = 0
  let cashSales = 0
  let creditSales = 0
  let digitalSales = 0

  for (const o of sales || []) {
    grossSales += parseFloat(o.grand_total)
    subtotal += parseFloat(o.subtotal)
    gstTotal += parseFloat(o.gst_total)
    if (o.payment_method === 'CASH') cashSales += parseFloat(o.grand_total)
    else if (o.payment_method === 'CREDIT') creditSales += parseFloat(o.grand_total)
    else digitalSales += parseFloat(o.grand_total)
  }

  // Cancelled count for the day.
  const { count: totalCancelled } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', entityId)
    .eq('status', 'CANCELLED')
    .gte('created_at', start)
    .lt('created_at', end)

  // Refunds for the day, from shift_transactions (REFUND) on this entity's shifts.
  const { data: shiftIds } = await supabase
    .from('shifts')
    .select('id')
    .eq('entity_id', entityId)

  let refundTotal = 0
  let totalRefunded = 0
  const ids = (shiftIds || []).map((s) => s.id)
  if (ids.length > 0) {
    const { data: refunds } = await supabase
      .from('shift_transactions')
      .select('amount')
      .eq('transaction_type', 'REFUND')
      .in('shift_id', ids)
      .gte('created_at', start)
      .lt('created_at', end)
    for (const r of refunds || []) {
      refundTotal += parseFloat(r.amount)
      totalRefunded++
    }
  }

  const netSales = grossSales - refundTotal

  return NextResponse.json({
    report: {
      date,
      totalOrders: sales?.length || 0,
      totalCancelled: totalCancelled || 0,
      totalRefunded,
      grossSales,
      subtotal,
      gstTotal,
      refundTotal,
      netSales,
      cashSales,
      creditSales,
      digitalSales,
    },
  })
}
