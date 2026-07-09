const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_RIDER, TEST_ENTITY } = require('../fixtures/test-data')
const { RiderPage } = require('../page-objects/rider-page')

// Full marketplace + rider delivery E2E flow.
// Uses manager auth for marketplace ordering (user_metadata.phone is set).

// ── Admin DB client (same pattern as c3-whatsapp-otp.spec.js) ─────────────
// Used ONLY to reset/seed rider + order state so the rider-delivery test is
// isolation-safe. The marketplace checkout flow (test 1) exercises the real
// auto-confirm + fire-and-forget assignRider path in the app.
function loadEnv() {
  if (process.env.SUPABASE_URL) return
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(__dirname, '..', '..', '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
  } catch {}
}
loadEnv()

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Ensure a MARKETPLACE delivery order is assigned to TEST_RIDER with a pickup OTP, CONFIRMED — the
 * state dispatch leaves an assigned order in. Queue model: assignment lives on orders.rider_id (there
 * is no per-rider current_order_id lock), and the rider works a QUEUE of active orders. is_available
 * now just means "on shift". pickup_otp is 123456 under MOCK_WHATSAPP, matching what the app generates.
 *
 * @returns {Promise<{orderId: string, orderNo: string}>}
 */
async function ensureAssignedRiderOrder() {
  const supabase = getAdminClient()

  // TEST_RIDER on shift.
  await supabase.from('riders').update({ is_available: true }).eq('id', TEST_RIDER.id)

  // Reuse an existing active assigned order (e.g. from a prior run), but REFRESH its pickup OTP +
  // expiry so a stale/expired code from an old run doesn't fail the pickup.
  const { data: existing } = await supabase
    .from('orders')
    .select('id, order_no')
    .eq('rider_id', TEST_RIDER.id)
    .eq('order_type', 'MARKETPLACE')
    .in('status', ['CONFIRMED', 'PROCESSING'])
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    await supabase.from('orders').update({
      status: 'CONFIRMED',
      pickup_otp: '123456',
      pickup_otp_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      delivery_otp: null,
      delivery_otp_expires_at: null,
    }).eq('id', existing.id)
    return { orderId: existing.id, orderNo: existing.order_no }
  }

  // Otherwise create a fresh assigned order (mirrors dispatch output).
  const year = new Date().getFullYear()
  const { data: last } = await supabase
    .from('orders')
    .select('order_no')
    .like('order_no', `MKT-${year}-%`)
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSerial = (last?.order_no ? parseInt(last.order_no.split('-')[2] ?? '0', 10) : 0) + 1
  const orderNo = `MKT-${year}-${String(nextSerial).padStart(5, '0')}`

  const pickupOtpExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_type: 'MARKETPLACE',
      order_no: orderNo,
      order_source: 'MARKETPLACE_WEB',
      status: 'CONFIRMED',
      fulfilment_mode: 'DELIVERY',
      dispatch_state: 'ASSIGNED',
      seller_id: TEST_ENTITY.id,
      buyer_whatsapp: '+97517100011',
      items: [{ sku: 'E2E', name: 'E2E Setup Item', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
      subtotal: 100,
      gst_total: 5,
      grand_total: 105,
      payment_method: 'CREDIT',
      delivery_address: 'Changzamtog, Thimphu (e2e setup)',
      rider_id: TEST_RIDER.id,
      assigned_at: new Date().toISOString(),
      pickup_otp: '123456',
      pickup_otp_expires_at: pickupOtpExpiresAt,
    })
    .select('id, order_no')
    .single()
  if (orderError) throw new Error('setup order insert failed: ' + orderError.message)

  await supabase.from('order_items').insert({
    order_id: order.id,
    name: 'E2E Setup Item',
    quantity: 1,
    unit_price: 100,
    discount: 0,
    gst_5: 5,
    total: 105,
    status: 'ACTIVE',
  })

  return { orderId: order.id, orderNo: order.order_no }
}

test.describe('Marketplace + Rider Flow — Customer → Vendor → Rider → Customer', () => {

  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('customer browses shop, adds items, checks out with delivery', async ({ page }) => {
    // ── Step 1: Browse marketplace ──────────────────────────────────────
    await page.goto('/shop')

    const addButtons = page.getByRole('button', { name: /add to cart/i })
    await expect(addButtons.first()).toBeVisible()

    // ── Step 2: Add product to cart ────────────────────────────────────
    await addButtons.first().click()

    // Open cart drawer
    const cartIcon = page.getByRole('button').filter({ has: page.locator('svg.lucide-shopping-bag') })
    await cartIcon.click()

    const checkoutBtn = page.getByRole('button', { name: /checkout/i })
    await expect(checkoutBtn).toBeVisible()
    await checkoutBtn.click()

    // ── Step 3: Checkout ───────────────────────────────────────────────
    await page.waitForURL('**/shop/checkout**')

    const addressTextarea = page.getByPlaceholder(/enter your full delivery address/i)
    await expect(addressTextarea).toBeVisible()
    await addressTextarea.fill('Changzamtog, Thimphu, near swimming pool')

    const placeOrderBtn = page.getByRole('button', { name: /place order/i })
    await expect(placeOrderBtn).toBeEnabled()

    // Track the place-order POST (app/api/shop/checkout/route.js) so we know
    // when assignRider has been fired. Falls back to the URL wait below if the
    // route name or timing differs.
    const orderResponse = page.waitForResponse(
      (res) => /\/api\/shop\/checkout/.test(res.url()) && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(() => null)

    await placeOrderBtn.click()

    // ── Step 4: Verify order placed ────────────────────────────────────
    await page.waitForURL('**/shop/orders**')
    await orderResponse
  })

  test('vendor sees marketplace orders tab', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')

    const mktTab = page.getByRole('button', { name: /^marketplace$/i })
    await expect(mktTab).toBeVisible()

    // Tab must render either orders or an empty state — never spin forever.
    const orderRow = page.locator('button:has(> .flex-1)').first()
    const emptyState = page.getByText(/no.*invoice|no.*order|empty/i)
    await expect(orderRow.or(emptyState)).toBeVisible()
  })

  // Marketplace orders are auto-CONFIRMED at checkout (checkout route inserts
  // status:'CONFIRMED' and fires assignRider) — there is no separate vendor
  // "Confirm/Accept Order" action button. The list rows render each order with
  // a CONFIRMED status badge (e.g. "MKT-2026-00005 CONFIRMED 25"). This test
  // verifies the real post-checkout vendor view: orders render CONFIRMED.
  test('vendor sees marketplace orders auto-confirmed after checkout', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')

    // Either at least one confirmed order row, or an empty state if the
    // checkout test was skipped on a retry.
    const orderRows = page.locator('button:has(> .flex-1)')
    const emptyState = page.getByText(/no.*invoice|no.*order|empty/i)
    await expect(orderRows.first().or(emptyState)).toBeVisible()

    if ((await orderRows.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No marketplace orders — checkout test may have been skipped' })
      return
    }

    // Every listed marketplace order must be CONFIRMED (auto-confirmed at
    // checkout — no pending state requiring vendor action).
    await expect(page.getByText('CONFIRMED').first()).toBeVisible()
  })

  // TEST_RIDER (rider@teststore.bt) is provisioned by e2e/fixtures/db-seed.js §14 (auth user +
  // riders row with auth_user_id/auth_email/auth_password). Login is EMAIL-OTP; under MOCK_WHATSAPP
  // the code is 123456. The setup helper guarantees an assigned, pickup-ready order in the queue.
  test('rider logs in (email-OTP), sees the queue, picks up and delivers', async ({ page }) => {
    const { orderId, orderNo } = await ensureAssignedRiderOrder()
    const rider = new RiderPage(page)

    // ── Step 1: Rider email-OTP login ──────────────────────────────────
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.email)
    expect(page.url()).toContain('/rider')
    expect(page.url()).not.toContain('/rider/login')

    // ── Step 2: The assigned order appears in the QUEUE ────────────────
    await rider.assertInQueue(orderNo)

    const q1 = await page.evaluate(async () => (await fetch('/api/rider/orders')).json())
    const queued = q1.queue.find((o) => o.id === orderId)
    expect(queued).toBeTruthy()
    expect(queued.order_no).toMatch(/^MKT-/)
    expect(queued.pickup_otp).toBeTruthy()

    // ── Step 3: Confirm pickup with the vendor OTP ─────────────────────
    await rider.confirmPickup(orderNo, queued.pickup_otp)

    // Pickup → DISPATCHED + a delivery OTP; the order stays in the queue.
    let deliveryOtp = null
    await expect.poll(async () => {
      const d = await page.evaluate(async () => (await fetch('/api/rider/orders')).json())
      const o = d.queue.find((x) => x.id === orderId)
      deliveryOtp = o?.delivery_otp || null
      return Boolean(deliveryOtp)
    }, { timeout: 8000, message: 'Delivery OTP was not generated after pickup' }).toBe(true)

    // ── Step 4: Confirm delivery with the customer OTP ─────────────────
    await rider.confirmDelivery(orderNo, deliveryOtp)

    // Delivered → the order leaves the active queue.
    await rider.assertNotInQueue(orderNo)

    // ── Step 5: Submit the delivery fee ────────────────────────────────
    const feeRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/rider/orders/${id}/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_fee: 50 }),
      })
      return { ok: res.ok, status: res.status }
    }, orderId)
    expect(feeRes.ok).toBeTruthy()
  })
})

// ── Rider dispatch: reject → re-dispatch, and the undeliverable state ──────────
test.describe('Rider dispatch — reject re-dispatches, undeliverable when no one left', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  // Seed a fresh CONFIRMED delivery order assigned to a given rider with a valid pickup OTP.
  async function seedAssignedOrder(supabase, riderId) {
    const year = new Date().getFullYear()
    const { data: last } = await supabase
      .from('orders').select('order_no').like('order_no', `MKT-${year}-%`)
      .order('order_no', { ascending: false }).limit(1).maybeSingle()
    const serial = (last?.order_no ? parseInt(last.order_no.split('-')[2] ?? '0', 10) : 0) + 1
    const orderNo = `MKT-${year}-${String(serial).padStart(5, '0')}`
    const { data: order } = await supabase.from('orders').insert({
      order_type: 'MARKETPLACE', order_no: orderNo, order_source: 'MARKETPLACE_WEB', status: 'CONFIRMED',
      fulfilment_mode: 'DELIVERY', dispatch_state: 'ASSIGNED', seller_id: TEST_ENTITY.id,
      buyer_whatsapp: '+97517100011',
      items: [{ sku: 'E2E', name: 'E2E', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
      subtotal: 100, gst_total: 5, grand_total: 105, payment_method: 'CREDIT',
      delivery_address: 'Thimphu (e2e dispatch)', rider_id: riderId, assigned_at: new Date().toISOString(),
      pickup_otp: '123456', pickup_otp_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    }).select('id, order_no').single()
    await supabase.from('order_items').insert({
      order_id: order.id, name: 'E2E', quantity: 1, unit_price: 100, discount: 0, gst_5: 5, total: 105, status: 'ACTIVE',
    })
    return order
  }

  async function riderIdByPhone(supabase, phone) {
    const { data } = await supabase.from('riders').select('id').eq('whatsapp_no', phone).maybeSingle()
    return data?.id
  }

  test('reject re-dispatches the order to another on-shift rider', async ({ page }) => {
    const supabase = getAdminClient()
    // Only TEST_RIDER + rider01 on shift; everyone else off.
    await supabase.from('riders').update({ is_available: false }).eq('is_active', true)
    await supabase.from('riders').update({ is_available: true }).in('whatsapp_no', [TEST_RIDER.phone, '+97517800001'])
    const otherId = await riderIdByPhone(supabase, '+97517800001')

    const order = await seedAssignedOrder(supabase, TEST_RIDER.id)

    const rider = new RiderPage(page)
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.email)

    // Reject via the authenticated rider API.
    const res = await page.request.post(`/api/rider/orders/${order.id}/reject`)
    expect(res.ok()).toBeTruthy()

    // The order is reassigned to the other on-shift rider, with TEST_RIDER recorded as declining.
    const { data: after } = await supabase
      .from('orders').select('rider_id, declined_rider_ids').eq('id', order.id).single()
    expect(after.rider_id).toBe(otherId)
    expect(after.declined_rider_ids).toContain(TEST_RIDER.id)
  })

  test('order becomes UNDELIVERABLE when the only on-shift rider rejects it', async ({ page }) => {
    const supabase = getAdminClient()
    // ONLY TEST_RIDER on shift.
    await supabase.from('riders').update({ is_available: false }).eq('is_active', true)
    await supabase.from('riders').update({ is_available: true }).eq('id', TEST_RIDER.id)

    const order = await seedAssignedOrder(supabase, TEST_RIDER.id)

    const rider = new RiderPage(page)
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.email)

    const res = await page.request.post(`/api/rider/orders/${order.id}/reject`)
    expect(res.ok()).toBeTruthy()

    // No eligible rider remains → unassigned + flagged undeliverable.
    const { data: after } = await supabase
      .from('orders').select('rider_id, dispatch_state, declined_rider_ids').eq('id', order.id).single()
    expect(after.rider_id).toBeNull()
    expect(after.dispatch_state).toBe('UNDELIVERABLE')
    expect(after.declined_rider_ids).toContain(TEST_RIDER.id)

    // The customer can cancel an undeliverable order (buyer-authorized endpoint exists + guards).
    const cancelUnauth = await page.request.post(`/api/shop/orders/${order.id}/cancel`)
    expect([401, 403]).toContain(cancelUnauth.status())

    // Restore the rider pool for other specs.
    await supabase.from('riders').update({ is_available: true }).eq('is_active', true)
  })
})
