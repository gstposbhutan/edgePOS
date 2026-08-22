import { NextResponse } from 'next/server'
import { resolveTerminal } from '@/lib/sync/terminal-auth'
import { entityContactEmail } from '@/lib/email/notify'
import { ACTIVE_STATUSES } from '@/lib/riders/dispatch'

/**
 * GET /api/sync/orders — the terminal pulls its store's active ONLINE (marketplace) orders so the
 * shopkeeper can manage them and read the rider the pickup OTP, without opening the web console.
 * Auth: the per-terminal Bearer token (vendor resolved from the token).
 */
export async function GET(request) {
  const t = await resolveTerminal(request)
  if (t.error) return NextResponse.json({ error: t.error }, { status: t.status })
  const { supabase, entityId } = t

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id, order_no, status, dispatch_state, fulfilment_mode,
      grand_total, gst_total, subtotal,
      delivery_address, delivery_lat, delivery_lng, pickup_otp,
      buyer_whatsapp, buyer_id, created_at,
      rider:riders!rider_id(name, whatsapp_no)
    `)
    .eq('seller_id', entityId)
    .eq('order_type', 'MARKETPLACE')
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (orders || []).map((o) => o.id)
  const buyerIds = [...new Set((orders || []).map((o) => o.buyer_id).filter(Boolean))]

  const [itemsRes, buyersRes] = await Promise.all([
    ids.length
      ? supabase.from('order_items').select('order_id, name, quantity, unit_price, total').in('order_id', ids)
      : Promise.resolve({ data: [] }),
    buyerIds.length
      ? supabase.from('entities').select('id, name').in('id', buyerIds)
      : Promise.resolve({ data: [] }),
  ])

  const itemsByOrder = new Map(ids.map((id) => [id, []]))
  for (const it of itemsRes.data || []) (itemsByOrder.get(it.order_id) || []).push(it)
  const buyerName = new Map((buyersRes.data || []).map((b) => [b.id, b.name]))

  // Customer emails (best-effort; distinct buyers only).
  const emailByBuyer = new Map()
  await Promise.all(buyerIds.map(async (bid) => {
    emailByBuyer.set(bid, await entityContactEmail(supabase, bid))
  }))

  const result = (orders || []).map((o) => ({
    cloud_id:         o.id,
    order_no:         o.order_no,
    status:           o.status,
    dispatch_state:   o.dispatch_state,
    fulfilment_mode:  o.fulfilment_mode,
    grand_total:      o.grand_total,
    gst_total:        o.gst_total,
    subtotal:         o.subtotal,
    delivery_address: o.delivery_address,
    delivery_lat:     o.delivery_lat,
    delivery_lng:     o.delivery_lng,
    pickup_otp:       o.pickup_otp,          // shared with the rider at collection
    customer_name:    buyerName.get(o.buyer_id) || 'Customer',
    customer_phone:   o.buyer_whatsapp,
    customer_email:   emailByBuyer.get(o.buyer_id) || null,
    rider_name:       o.rider?.name || null,
    rider_phone:      o.rider?.whatsapp_no || null,
    created_at:       o.created_at,
    items:            itemsByOrder.get(o.id) || [],
  }))

  return NextResponse.json({ orders: result })
}
