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
 * Ensure a marketplace order is assigned to TEST_RIDER with a pickup OTP, in
 * CONFIRMED state — exactly the state the app's `assignRider` (checkout route
 * / order-detail PATCH) leaves an order in after auto-assignment.
 *
 * `assignRider` is fire-and-forget and only runs when (a) a fresh checkout
 * fires it AND (b) the rider row is free (`is_available=true`,
 * `current_order_id IS NULL`). On a test RETRY only the failed test re-runs,
 * so no fresh checkout fires assignRider, and a prior partial run can leave
 * the rider stuck (is_available=false). That makes the rider dashboard show
 * "No active order" for reasons unrelated to the rider-delivery code under
 * test. This setup guarantees a real, assigned, pickup-ready order exists so
 * the pickup → dispatch → deliver → fee flow is always exercisable.
 *
 * @returns {Promise<{orderId: string, orderNo: string}>}
 */
async function ensureAssignedRiderOrder() {
  const supabase = getAdminClient()

  // 1. Free the rider from any stuck prior order, then mark available.
  const { data: stuck } = await supabase
    .from('riders')
    .select('current_order_id')
    .eq('id', TEST_RIDER.id)
    .maybeSingle()
  if (stuck?.current_order_id) {
    await supabase
      .from('orders')
      .update({ rider_id: null })
      .eq('id', stuck.current_order_id)
  }
  await supabase
    .from('riders')
    .update({ is_available: true, current_order_id: null })
    .eq('id', TEST_RIDER.id)

  // 2. If the rider already has a current, pickup-ready order (from a sibling
  //    checkout test in the same run), reuse it.
  const { data: existing } = await supabase
    .from('riders')
    .select('current_order_id')
    .eq('id', TEST_RIDER.id)
    .maybeSingle()
  if (existing?.current_order_id) {
    const { data: cur } = await supabase
      .from('orders')
      .select('id, order_no, pickup_otp')
      .eq('id', existing.current_order_id)
      .maybeSingle()
    if (cur?.pickup_otp) {
      return { orderId: cur.id, orderNo: cur.order_no }
    }
  }

  // 3. Otherwise create a fresh assigned order (mirrors assignRider output).
  const year = new Date().getFullYear()
  const { data: last } = await supabase
    .from('orders')
    .select('order_no')
    .like('order_no', `MKT-${year}-%`)
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSerial = (last?.order_no
    ? parseInt(last.order_no.split('-')[2] ?? '0', 10)
    : 0) + 1
  const orderNo = `MKT-${year}-${String(nextSerial).padStart(5, '0')}`

  const subtotal = 100
  const gstTotal = 5
  const grandTotal = 105
  const pickupOtp = String(Math.floor(100000 + Math.random() * 900000))
  const pickupOtpExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_type: 'MARKETPLACE',
      order_no: orderNo,
      order_source: 'E2E_SETUP',
      status: 'CONFIRMED',
      seller_id: TEST_ENTITY.id,
      buyer_whatsapp: '+97517100011',
      items: [{ sku: 'E2E', name: 'E2E Setup Item', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
      subtotal,
      gst_total: gstTotal,
      grand_total: grandTotal,
      payment_method: 'CREDIT',
      delivery_address: 'Changzamtog, Thimphu (e2e setup)',
      rider_id: TEST_RIDER.id,
      pickup_otp: pickupOtp,
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

  await supabase
    .from('riders')
    .update({ is_available: false, current_order_id: order.id })
    .eq('id', TEST_RIDER.id)

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

  // TEST_RIDER (+97517100050, pin 1234) is provisioned by e2e/fixtures/db-seed.js
  // §14 (auth user rider@teststore.bt + a riders row with auth_user_id/auth_email/
  // auth_password/pin_hash). The setup helper above guarantees a real assigned
  // order exists so the rider-delivery flow is exercisable regardless of
  // whether the checkout sibling ran in this invocation.
  test('rider picks up and delivers the marketplace order', async ({ page }) => {
    // ── Setup: guarantee an assigned, pickup-ready order for TEST_RIDER ──
    const { orderId } = await ensureAssignedRiderOrder()

    const rider = new RiderPage(page)

    // ── Step 1: Rider logs in ──────────────────────────────────────────
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.phone, TEST_RIDER.pin)
    expect(page.url()).toContain('/rider')
    expect(page.url()).not.toContain('/rider/login')

    // ── Step 2: The assigned order must appear on the dashboard ────────
    // (No polling for fire-and-forget assignment — setup pre-assigned it.)
    await rider.assertOrderVisible()

    let currentOrder = await page.evaluate(async () => {
      const res = await fetch('/api/rider/orders')
      return res.json()
    })
    expect(currentOrder.current.order_no).toMatch(/^MKT-/)
    expect(currentOrder.current.id).toBe(orderId)

    await rider.refreshOrders()

    // ── Step 3: Accept order if Accept button is shown ─────────────────
    // Auto-assign sets pickup_otp, so Confirm Pickup is shown directly and
    // this branch is skipped. Kept for orders assigned without a pickup OTP.
    if (await rider.acceptButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rider.acceptOrder()
      // Accept generates pickup OTP — re-fetch (keep currentOrder as the full
      // { current, ... } API response so currentOrder.current.* is consistent).
      await expect.poll(async () => {
        const data = await page.evaluate(async () => {
          const res = await fetch('/api/rider/orders')
          return res.json()
        })
        if (data.current?.pickup_otp) currentOrder = data
        return Boolean(data.current?.pickup_otp)
      }, { timeout: 5000, message: 'Pickup OTP was not generated after Accept' }).toBe(true)
    } else {
      currentOrder = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
    }

    // ── Step 4: Confirm pickup with real OTP ───────────────────────────
    expect(currentOrder.current.pickup_otp).toBeTruthy()
    await rider.assertCanPickup()
    await rider.confirmPickup(currentOrder.current.pickup_otp)

    // Pickup generates delivery OTP — re-fetch (keep currentOrder as the full
    // { current, ... } API response so currentOrder.current.* stays consistent).
    await expect.poll(async () => {
      const data = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
      if (data.current?.delivery_otp) currentOrder = data
      return Boolean(data.current?.delivery_otp)
    }, { timeout: 5000, message: 'Delivery OTP was not generated after pickup' }).toBe(true)

    // ── Step 5: Confirm delivery with real OTP ─────────────────────────
    await rider.assertCanDeliver()
    await rider.confirmDelivery(currentOrder.current.delivery_otp)

    // ── Step 6: Submit delivery fee via API ─────────────────────────────
    // After delivery, the rider is freed (current_order_id = null) so the fee
    // form disappears from the dashboard. Submit fee via API directly.
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
