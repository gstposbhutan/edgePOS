import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/orders/search?q=&limit= — invoice lookup for the POS search modal.
 *
 * Accepts the deck's shorthand: `26/1` or `26-1` → year 2026, serial 1 →
 * matches `order_no ILIKE '%-2026-00001%'`. Anything else is a free-text
 * ILIKE over order_no / buyer_whatsapp.
 *
 * Scoped to the seller's POS_SALE + WHOLESALE orders. Customer names are
 * resolved via a second khata_accounts lookup (phone match) since there is no
 * FK from orders → khata_accounts.
 */
function buildOr(q) {
  const sh = q.match(/^(\d{1,2})[/\-](\d{1,5})$/)            // 26/1, 26-01, 6/12 …
  if (sh) {
    const year = 2000 + parseInt(sh[1], 10)                   // 26 → 2026
    const serial = String(parseInt(sh[2], 10)).padStart(5, '0')
    return `order_no.ilike.%-${year}-${serial}%`
  }
  const safe = q.replace(/,/g, ' ')                           // commas break the `or` clause
  return `order_no.ilike.%${safe}%,buyer_whatsapp.ilike.%${safe}%`
}

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 100)

  if (!q) return NextResponse.json({ results: [] })

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_no, grand_total, gst_total, created_at, buyer_whatsapp, status')
    .eq('seller_id', entityId)
    .in('order_type', ['POS_SALE', 'WHOLESALE'])
    .or(buildOr(q))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!orders?.length) return NextResponse.json({ results: [] })

  // Resolve customer names by phone (no FK orders → khata_accounts).
  const phones = [...new Set(orders.map(o => o.buyer_whatsapp).filter(Boolean))]
  const nameByPhone = {}
  if (phones.length) {
    const { data: accounts } = await supabase
      .from('khata_accounts')
      .select('debtor_phone, debtor_name')
      .eq('creditor_entity_id', entityId)
      .in('debtor_phone', phones)
    for (const a of accounts ?? []) nameByPhone[a.debtor_phone] = a.debtor_name
  }

  const results = orders.map(o => ({
    id: o.id,
    order_no: o.order_no,
    grand_total: o.grand_total,
    gst_total: o.gst_total,
    created_at: o.created_at,
    buyer_whatsapp: o.buyer_whatsapp,
    status: o.status,
    customer_name: o.buyer_whatsapp ? (nameByPhone[o.buyer_whatsapp] ?? null) : null,
  }))

  return NextResponse.json({ results })
}
