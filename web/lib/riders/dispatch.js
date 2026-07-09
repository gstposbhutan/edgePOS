// Rider dispatch — even, location-aware push of delivery orders to riders.
//
// Replaces the old "first available rider, else orphan the order" logic. A rider now works a QUEUE;
// a new delivery order goes to the on-shift rider with the FEWEST active orders (even distribution),
// ties broken by proximity of the rider to the pickup (vendor) point, then round-robin
// (least-recently-assigned). When nobody is on shift the order waits unassigned and is drained the
// moment a rider comes online (see drainBacklog).
//
// All functions take a Supabase client (service or authenticated) as the first arg, matching the
// surrounding API code.

import { sendEmail, isRealEmail, notifyEntity, entityOwnerEmail } from '@/lib/email/notify'

// A rider's "active" orders — everything in flight, from assigned through en-route.
export const ACTIVE_STATUSES = ['CONFIRMED', 'PROCESSING', 'DISPATCHED']

export function generateOtp() {
  // In mock mode (no live WhatsApp/SMS to carry the code), use a predictable value so the pickup and
  // delivery handshakes are testable end-to-end — mirrors the login email-OTP behaviour (123456).
  if (process.env.MOCK_WHATSAPP === 'true') return '123456'
  return String(Math.floor(100000 + Math.random() * 900000))
}

// Great-circle distance in km, or null when either point is missing.
export function haversineKm(aLat, aLng, bLat, bLng) {
  const nums = [aLat, aLng, bLat, bLng].map((v) => (v == null ? NaN : Number(v)))
  if (nums.some((n) => Number.isNaN(n))) return null
  const [la1, lo1, la2, lo2] = nums
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(la2 - la1)
  const dLng = toRad(lo2 - lo1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Current active-order count per rider id → Map(id → count).
async function activeCounts(supabase, riderIds) {
  const counts = new Map(riderIds.map((id) => [id, 0]))
  if (!riderIds.length) return counts
  const { data } = await supabase
    .from('orders')
    .select('rider_id')
    .in('rider_id', riderIds)
    .in('status', ACTIVE_STATUSES)
  for (const row of data || []) {
    counts.set(row.rider_id, (counts.get(row.rider_id) || 0) + 1)
  }
  return counts
}

/**
 * Choose the best rider for a pickup, or null if none are on shift.
 * Order of preference: fewest active orders → nearest to pickup → least-recently-assigned.
 */
export async function pickRider(supabase, { pickupLat, pickupLng, excludeIds = [] } = {}) {
  const { data: riders } = await supabase
    .from('riders')
    .select('id, name, whatsapp_no, auth_email, email_notifications_enabled, last_lat, last_lng, last_assigned_at')
    .eq('is_active', true)
    .eq('is_available', true)

  const pool = (riders || []).filter((r) => !excludeIds.includes(r.id))
  if (!pool.length) return null

  const counts = await activeCounts(supabase, pool.map((r) => r.id))

  const scored = pool.map((r) => ({
    rider: r,
    load: counts.get(r.id) || 0,
    // null distance sorts last (unknown location shouldn't win a proximity tie)
    dist: haversineKm(r.last_lat, r.last_lng, pickupLat, pickupLng),
    lastAssigned: r.last_assigned_at ? new Date(r.last_assigned_at).getTime() : 0,
  }))

  scored.sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load               // 1) even distribution
    const ad = a.dist == null ? Infinity : a.dist
    const bd = b.dist == null ? Infinity : b.dist
    if (ad !== bd) return ad - bd                                // 2) proximity to pickup
    return a.lastAssigned - b.lastAssigned                       // 3) round-robin fairness
  })

  return scored[0].rider
}

/** Email the assigned rider (only if they opted in and have a real address). Fire-and-forget. */
async function notifyRider(rider, { orderNo, vendorName, deliveryAddress }) {
  if (!rider?.email_notifications_enabled || !isRealEmail(rider.auth_email)) return
  const body =
    `New delivery assigned: order ${orderNo}.\n` +
    (vendorName ? `Pick up from: ${vendorName}\n` : '') +
    (deliveryAddress ? `Deliver to: ${deliveryAddress}\n` : '') +
    `\nOpen the Rider Portal to see it in your queue.`
  await sendEmail(rider.auth_email, `New delivery — ${orderNo}`, body)
}

/** Tell the vendor and customer an order couldn't reach any rider, so they can cancel or wait. */
async function notifyUndeliverable(supabase, order) {
  const on = order.order_no
  if (order.seller_id) {
    await notifyEntity(supabase, order.seller_id, {
      type: 'ORDER',
      title: `Order ${on}: no delivery rider available`,
      body: `We couldn't assign a delivery rider for order ${on}. You can cancel it, or wait for a rider to come online.`,
      link: `/pos/orders/${order.id}`,
    })
  }
  if (order.buyer_id) {
    await notifyEntity(supabase, order.buyer_id, {
      type: 'ORDER',
      title: `Order ${on}: we're having trouble finding a rider`,
      body: `No delivery rider is available for order ${on} right now. You can cancel it from your orders, or wait for a rider.`,
      link: `/shop/orders`,
    })
  }
}

/**
 * Push one order to the best rider. Idempotent: no-op if already assigned. Excludes riders who have
 * declined this order. Returns { assigned, riderId }.
 */
export async function assignOrderToRider(supabase, orderId) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, status, rider_id, buyer_id, fulfilment_mode, order_type, seller_id, delivery_address, delivery_lat, delivery_lng, declined_rider_ids, dispatch_state')
      .eq('id', orderId)
      .single()

    if (!order) return { assigned: false }
    if (order.rider_id) return { assigned: true, riderId: order.rider_id }        // already owned
    if (order.order_type !== 'MARKETPLACE') return { assigned: false }
    if ((order.fulfilment_mode || 'DELIVERY') !== 'DELIVERY') return { assigned: false } // pickup: no rider
    if (!ACTIVE_STATUSES.includes(order.status)) return { assigned: false }

    // Pickup anchor = vendor coords if known, else the delivery point as a rough geographic hint.
    let pickupLat = null, pickupLng = null, vendorName = null, vendorPhone = null
    if (order.seller_id) {
      const { data: vendor } = await supabase
        .from('entities').select('name, whatsapp_no, lat, lng').eq('id', order.seller_id).single()
      vendorName = vendor?.name || null
      vendorPhone = vendor?.whatsapp_no || null
      pickupLat = vendor?.lat ?? null
      pickupLng = vendor?.lng ?? null
    }
    if (pickupLat == null && order.delivery_lat != null) {
      pickupLat = order.delivery_lat
      pickupLng = order.delivery_lng
    }

    const declined = order.declined_rider_ids || []
    const rider = await pickRider(supabase, { pickupLat, pickupLng, excludeIds: declined })

    if (!rider) {
      // No rider could take it. Distinguish "waiting for someone to come on shift" (transient) from
      // "everyone on shift has already declined it" (won't self-resolve → customer/vendor should act).
      const { count: onShift } = await supabase
        .from('riders').select('id', { count: 'exact', head: true })
        .eq('is_active', true).eq('is_available', true)
      const state = onShift > 0 ? 'UNDELIVERABLE' : 'SEARCHING'
      await supabase.from('orders').update({ dispatch_state: state }).eq('id', orderId).is('rider_id', null)
      // Alert only on the transition INTO undeliverable, so re-runs (e.g. drainBacklog) don't spam.
      if (state === 'UNDELIVERABLE' && order.dispatch_state !== 'UNDELIVERABLE') {
        await notifyUndeliverable(supabase, order)
      }
      return { assigned: false, state }
    }

    const now = new Date().toISOString()
    const pickupOtp = generateOtp()
    const pickupOtpExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    await supabase
      .from('orders')
      .update({
        rider_id: rider.id,
        assigned_at: now,
        rider_accepted_at: now,
        dispatch_state: 'ASSIGNED',
        pickup_otp: pickupOtp,
        pickup_otp_expires_at: pickupOtpExpiresAt,
      })
      .eq('id', orderId)
      .is('rider_id', null)          // guard: don't clobber a concurrent assignment

    await supabase.from('riders').update({ last_assigned_at: now }).eq('id', rider.id)

    // Vendor gets the pickup OTP; rider gets an email nudge (both fire-and-forget).
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    if (vendorPhone) {
      fetch(`${gatewayUrl}/api/send-pickup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorPhone, orderNo: order.order_no, riderName: rider.name, pickupOtp }),
      }).catch(() => {})
    }
    // Deliver the pickup code to the vendor on every channel: WhatsApp (above), an in-app notification
    // (always — visible even when the vendor's email is a placeholder), and email (real inboxes).
    ;(async () => {
      await supabase.from('notifications').insert({
        entity_id: order.seller_id,
        type: 'ORDER',
        title: `Pickup code for ${order.order_no}: ${pickupOtp}`,
        body: `Give rider ${rider.name} this pickup code to confirm handover: ${pickupOtp}`,
        link: `/pos/orders/${order.id}`,
      })
      const vendorEmail = await entityOwnerEmail(supabase, order.seller_id)
      if (vendorEmail) await sendEmail(
        vendorEmail,
        `Pickup code for order ${order.order_no}`,
        `Rider ${rider.name} is collecting order ${order.order_no}.\nPickup code: ${pickupOtp}\n\nIt also appears on your order screen.`,
      )
    })().catch(() => {})
    notifyRider(rider, { orderNo: order.order_no, vendorName, deliveryAddress: order.delivery_address }).catch(() => {})

    return { assigned: true, riderId: rider.id }
  } catch (err) {
    console.error('[dispatch/assignOrderToRider]', err.message)
    return { assigned: false }
  }
}

/**
 * Assign every orphaned marketplace delivery order (no rider, still active). Called when a rider comes
 * on shift and after a rejection, so a backlog drains as soon as capacity appears. Returns the count
 * newly assigned.
 */
export async function drainBacklog(supabase) {
  try {
    // Short-circuit when no capacity exists at all — avoids a per-order pick with nobody to pick.
    const { count: onShift } = await supabase
      .from('riders').select('id', { count: 'exact', head: true })
      .eq('is_active', true).eq('is_available', true)
    if (!onShift) return 0

    const { data: orphans } = await supabase
      .from('orders')
      .select('id')
      .eq('order_type', 'MARKETPLACE')
      .eq('fulfilment_mode', 'DELIVERY')
      .is('rider_id', null)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })     // oldest orders first (FIFO fairness to customers)

    let assigned = 0
    for (const o of orphans || []) {
      const r = await assignOrderToRider(supabase, o.id)
      if (r.assigned) assigned++   // a specific order may be undeliverable (all riders declined it) — skip, don't halt
    }
    return assigned
  } catch (err) {
    console.error('[dispatch/drainBacklog]', err.message)
    return 0
  }
}
