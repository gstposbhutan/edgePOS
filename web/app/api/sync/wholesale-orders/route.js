import { NextResponse } from 'next/server'
import { resolveTerminal } from '@/lib/sync/terminal-auth'

/**
 * GET /api/sync/wholesale-orders — a BACK_OFFICE (distributor/wholesaler) terminal pulls the incoming
 * B2B orders it must fulfil: WHOLESALE orders where its entity is the seller, in an actionable state.
 * Auth: the per-terminal Bearer token (entity resolved from the token, never the request). Mirrors
 * /api/sync/orders (the marketplace feed) — the terminal upserts these into a local `b2b_orders`
 * mirror and acts on them via POST /api/sync/wholesale-orders/[id].
 */
const ACTIONABLE = ['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED']

export async function GET(request) {
  const t = await resolveTerminal(request)
  if (t.error) return NextResponse.json({ error: t.error }, { status: t.status })
  const { supabase, entityId } = t

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_no, status, payment_method, subtotal, gst_total, grand_total, buyer_id, created_at')
    .eq('seller_id', entityId)
    .eq('order_type', 'WHOLESALE')
    .in('status', ACTIONABLE)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (orders || []).map(o => o.id)
  const buyerIds = [...new Set((orders || []).map(o => o.buyer_id).filter(Boolean))]
  const [itemsRes, buyersRes] = await Promise.all([
    ids.length ? supabase.from('order_items').select('order_id, name, sku, quantity, unit_price, total').in('order_id', ids).eq('status', 'ACTIVE') : Promise.resolve({ data: [] }),
    buyerIds.length ? supabase.from('entities').select('id, name, whatsapp_no, tpn_gstin').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const itemsByOrder = new Map(ids.map(id => [id, []]))
  for (const it of itemsRes.data || []) (itemsByOrder.get(it.order_id) || []).push(it)
  const buyerById = new Map((buyersRes.data || []).map(b => [b.id, b]))

  const result = (orders || []).map(o => ({
    cloud_id:       o.id,
    order_no:       o.order_no,
    status:         o.status,
    payment_method: o.payment_method,
    subtotal:       o.subtotal,
    gst_total:      o.gst_total,
    grand_total:    o.grand_total,
    buyer_name:     buyerById.get(o.buyer_id)?.name || 'Buyer',
    buyer_phone:    buyerById.get(o.buyer_id)?.whatsapp_no || null,
    buyer_tpn:      buyerById.get(o.buyer_id)?.tpn_gstin || null,
    created_at:     o.created_at,
    items:          itemsByOrder.get(o.id) || [],
  }))
  return NextResponse.json({ orders: result })
}
