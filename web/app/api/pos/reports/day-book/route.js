import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/reports/day-book?from=&to=
 *
 * Every voucher the shop raised in a period, in the order it happened.
 *
 * This is not /api/shifts/z-report. That answers "what did the day come to" — one screen of
 * totals per date, which is a Z reading. A Day Book answers "what happened, in order", so it
 * lists each voucher with its type, party and amount, and totals at the foot. A shop reaches for
 * the Z reading to close a till and for the Day Book to find the transaction someone is asking
 * about.
 */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, payment_method, subtotal, gst_total, grand_total, supplier_name, buyer_phone, created_at')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: true })
    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []

    // Purchases are money going out, sales money coming in. Totalling them into one column would
    // produce a number that means nothing, so they are summed separately.
    const isPurchase = (t) => t === 'PURCHASE_ORDER' || t === 'PURCHASE_INVOICE'
    const totals = rows.reduce((acc, o) => {
      const amt = parseFloat(o.grand_total ?? 0)
      if (isPurchase(o.order_type)) acc.purchases += amt
      else acc.sales += amt
      acc.gst += parseFloat(o.gst_total ?? 0)
      return acc
    }, { sales: 0, purchases: 0, gst: 0 })

    // By type, so the foot can say what the day was made of.
    const byType = {}
    for (const o of rows) {
      const t = o.order_type || 'OTHER'
      byType[t] = byType[t] || { count: 0, amount: 0 }
      byType[t].count += 1
      byType[t].amount += parseFloat(o.grand_total ?? 0)
    }

    return NextResponse.json({ rows, totals, byType, count: rows.length })
  } catch (err) {
    console.error('[reports/day-book] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
