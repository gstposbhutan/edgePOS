import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GST report for the retailer POS. Aggregates the store's settled orders over a period into output tax
// (GST collected on sales), input tax / ITC (GST paid on intra-platform purchases), net GST payable,
// and a taxable-vs-exempt turnover split. Financial data — OWNER/MANAGER/ADMIN only, entity-scoped.
const SALE_TYPES = ['POS_SALE', 'MARKETPLACE', 'WHOLESALE', 'SALES_INVOICE']     // carry output GST (seller side)
const PURCHASE_TYPES = ['WHOLESALE', 'SALES_INVOICE', 'PURCHASE_INVOICE']        // intra-platform buys carry input GST (buyer side)
const SETTLED = ['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'PARTIALLY_FULFILLED', 'SENT', 'PAID']
const monthKey = (iso) => (iso || '').slice(0, 7)   // YYYY-MM
const money = (n) => parseFloat((n || 0).toFixed(2))

export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER', 'ADMIN'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const to = searchParams.get('to') || new Date().toISOString()
    // default window: 12 months back from `to`
    const from = searchParams.get('from') || new Date(new Date(to).getTime() - 365 * 86400000).toISOString()

    // Sales (output) + purchases (input) in the window.
    const [salesRes, purchasesRes] = await Promise.all([
      supabase.from('orders')
        .select('id, subtotal, gst_total, grand_total, created_at, order_type')
        .eq('seller_id', entityId).in('order_type', SALE_TYPES).in('status', SETTLED)
        .gte('created_at', from).lte('created_at', to),
      supabase.from('orders')
        .select('gst_total, created_at')
        .eq('buyer_id', entityId).in('order_type', PURCHASE_TYPES).in('status', SETTLED)
        .gte('created_at', from).lte('created_at', to),
    ])
    if (salesRes.error) return NextResponse.json({ error: salesRes.error.message }, { status: 500 })
    const sales = salesRes.data || []
    const purchases = purchasesRes.data || []

    // Taxable vs exempt turnover: split each sale line's pre-tax base by whether it bore GST.
    const saleIds = sales.map(s => s.id)
    let taxableBase = 0, exemptBase = 0
    if (saleIds.length) {
      // Chunk the IN() to stay well under PostgREST limits.
      for (let i = 0; i < saleIds.length; i += 300) {
        const chunk = saleIds.slice(i, i + 300)
        const { data: items } = await supabase
          .from('order_items').select('total, gst_5, status').in('order_id', chunk).eq('status', 'ACTIVE')
        for (const it of items || []) {
          const gst = parseFloat(it.gst_5 || 0)
          const base = parseFloat(it.total || 0) - gst   // total is tax-inclusive; base is pre-tax
          if (gst > 0) taxableBase += base
          else exemptBase += base
        }
      }
    }

    // Monthly rollup.
    const byMonth = {}
    const bucket = (m) => (byMonth[m] ||= { month: m, gross_sales: 0, output_gst: 0, input_gst: 0 })
    for (const s of sales) { const b = bucket(monthKey(s.created_at)); b.gross_sales += parseFloat(s.subtotal || 0); b.output_gst += parseFloat(s.gst_total || 0) }
    for (const p of purchases) { const b = bucket(monthKey(p.created_at)); b.input_gst += parseFloat(p.gst_total || 0) }
    const months = Object.values(byMonth)
      .map(b => ({ month: b.month, gross_sales: money(b.gross_sales), output_gst: money(b.output_gst), input_gst: money(b.input_gst), net_gst: money(b.output_gst - b.input_gst) }))
      .sort((a, b) => a.month.localeCompare(b.month))

    const outputGst = money(sales.reduce((s, o) => s + parseFloat(o.gst_total || 0), 0))
    const inputGst = money(purchases.reduce((s, o) => s + parseFloat(o.gst_total || 0), 0))
    const summary = {
      from, to,
      gross_sales: money(sales.reduce((s, o) => s + parseFloat(o.subtotal || 0), 0)),
      taxable_sales: money(taxableBase),
      exempt_sales: money(exemptBase),
      output_gst: outputGst,
      input_gst: inputGst,      // ITC available
      net_gst: money(outputGst - inputGst),
      sales_count: sales.length,
      purchases_count: purchases.length,
    }
    return NextResponse.json({ summary, months })
  } catch (err) {
    console.error('[pos/reports/gst] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
