import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyEntity, sendEmail, entityContactEmail } from '@/lib/email/notify'

// POST /api/webhooks/toofan — delivery events from the Toofan courier, for marketplace orders
// handed to them instead of an in-house rider. Replaces the retired standalone logistics-bridge
// service (its rider webhook + dispatch endpoints are superseded by /api/rider/* and
// lib/riders/dispatch).
//
// Auth: shared secret in `x-toofan-token` == env TOOFAN_WEBHOOK_SECRET (same shape as the
// desktop release-ingest route — a webhook caller has no user session). Toofan's own signing
// scheme was never documented; when it is, replace the body of verifyCaller() with an HMAC over
// `rawBody` — it is read as text here precisely so a signature can be computed over it.
//
// Body: { event, orderId, courierRef? }. Events: PICKED_UP | DELIVERED | FAILED
// (aliases UNDELIVERABLE, RETURNED). Unknown events are accepted and ignored so a provider-side
// addition never turns into a retry storm.
export const runtime = 'nodejs'

const FAILED_EVENTS = ['FAILED', 'UNDELIVERABLE', 'RETURNED']

function verifyCaller(request, _rawBody) {
  const secret = process.env.TOOFAN_WEBHOOK_SECRET
  if (!secret) return { ok: false, status: 503, error: 'Toofan webhook not configured' }
  const presented = request.headers.get('x-toofan-token') || ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  // timingSafeEqual throws on a length mismatch, so compare lengths first (that leak is unavoidable).
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}

export async function POST(request) {
  try {
    const rawBody = await request.text()

    const auth = verifyCaller(request, rawBody)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    let body
    try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

    const event = String(body.event || '').toUpperCase()
    const orderId = body.orderId
    if (!event || !orderId) {
      return NextResponse.json({ error: 'event and orderId are required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

    // Only marketplace deliveries are courier-eligible; scoping here keeps a leaked token from
    // being able to walk POS sales or purchase orders through delivery states.
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, status, dispatch_state, seller_id, buyer_id, payment_token, grand_total')
      .eq('id', orderId)
      .eq('order_type', 'MARKETPLACE')
      .eq('fulfilment_mode', 'DELIVERY')
      .maybeSingle()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    if (event === 'PICKED_UP') return await handlePickedUp(supabase, order)
    if (event === 'DELIVERED') return await handleDelivered(supabase, order)
    if (FAILED_EVENTS.includes(event)) return await handleFailed(supabase, order, body.reason)

    // Accepted-but-ignored: a 2xx stops the provider retrying an event we have no rule for.
    return NextResponse.json({ success: true, applied: false, reason: `Unhandled event ${event}` })

  } catch (error) {
    console.error('[webhooks/toofan]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Courier collected the parcel → DISPATCHED. No delivery OTP is issued: the OTP handshake is for
// our own riders (see api/rider/orders/[id]/pickup); Toofan's driver confirms via this webhook.
async function handlePickedUp(supabase, order) {
  // Conditional update = idempotent. A redelivered webhook matches no row and applies nothing.
  const { data: updated } = await supabase
    .from('orders')
    .update({ status: 'DISPATCHED' })
    .eq('id', order.id)
    .in('status', ['CONFIRMED', 'PROCESSING'])
    .select('id')

  if (!updated?.length) {
    return NextResponse.json({ success: true, applied: false, status: order.status })
  }

  if (order.buyer_id) {
    void notifyBuyer(
      supabase,
      order.buyer_id,
      order.id,
      `Order ${order.order_no} is on its way`,
      `Toofan has collected order ${order.order_no} and is delivering it to you.`,
    )
  }

  return NextResponse.json({ success: true, applied: true, status: 'DISPATCHED' })
}

// Courier confirmed hand-over → DELIVERED, and the customer is asked to pay if the order is
// pay-on-delivery. (The legacy bridge sent that link over WhatsApp; WhatsApp is retired, so it
// goes to the in-app notification + email like the rest of the order flow.)
async function handleDelivered(supabase, order) {
  const { data: updated } = await supabase
    .from('orders')
    .update({ status: 'DELIVERED', delivery_otp: null, delivery_otp_expires_at: null })
    .eq('id', order.id)
    .eq('status', 'DISPATCHED')
    .select('id')

  if (!updated?.length) {
    return NextResponse.json({ success: true, applied: false, status: order.status })
  }

  if (order.buyer_id) {
    // payment_token is nulled once the order is paid (api/shop/pay/[orderId]), so its presence
    // is what "still owes" means — same signal the customer's order page uses to show Pay.
    const payUrl = order.payment_token ? `/pay/${order.id}?token=${order.payment_token}` : null
    const amount = 'Nu ' + Math.round(Number(order.grand_total) || 0).toLocaleString('en-IN')
    void notifyBuyer(
      supabase,
      order.buyer_id,
      order.id,
      `Order ${order.order_no} delivered`,
      payUrl
        ? `Order ${order.order_no} has been delivered. Amount due: ${amount}. Tap to pay.`
        : `Order ${order.order_no} has been delivered. Thank you for shopping with us.`,
      payUrl,
    )
  }

  return NextResponse.json({ success: true, applied: true, status: 'DELIVERED' })
}

// Courier could not deliver. The order status is deliberately left alone — whether to retry,
// re-dispatch in-house or cancel is the vendor's call (and the customer can self-cancel while
// it is still pre-dispatch). This only raises the flag the consoles already read.
async function handleFailed(supabase, order, reason) {
  if (order.dispatch_state === 'UNDELIVERABLE') {
    return NextResponse.json({ success: true, applied: false, dispatchState: 'UNDELIVERABLE' })
  }

  await supabase
    .from('orders')
    .update({ dispatch_state: 'UNDELIVERABLE' })
    .eq('id', order.id)

  const detail = reason ? ` Reason: ${reason}` : ''
  void notifyEntity(supabase, order.seller_id, {
    type: 'ORDER',
    title: `Delivery failed for order ${order.order_no}`,
    body: `Toofan could not deliver order ${order.order_no}.${detail} Re-dispatch it or contact the customer.`,
    link: `/pos/orders/${order.id}`,
  })

  if (order.buyer_id) {
    void notifyBuyer(
      supabase,
      order.buyer_id,
      order.id,
      `Delivery attempt failed for order ${order.order_no}`,
      `We could not deliver order ${order.order_no}.${detail} The store will be in touch.`,
    )
  }

  return NextResponse.json({ success: true, applied: true, dispatchState: 'UNDELIVERABLE' })
}

// Customers get the in-app notification unconditionally (it shows even on a placeholder email)
// and the email only when the address is real — mirrors api/rider/orders/[id]/pickup.
async function notifyBuyer(supabase, buyerId, orderId, title, body, link = null) {
  try {
    await supabase.from('notifications').insert({
      entity_id: buyerId,
      type: 'ORDER',
      title,
      body,
      link: link || `/shop/orders/${orderId}`,
    })
    const email = await entityContactEmail(supabase, buyerId)
    if (email) await sendEmail(email, title, body)
  } catch (err) {
    console.error('[webhooks/toofan] buyer notify', err.message)
  }
}
