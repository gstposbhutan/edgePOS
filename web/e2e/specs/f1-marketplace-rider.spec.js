const { test, expect } = require('@playwright/test')
const { TEST_RIDER } = require('../fixtures/test-data')
const { RiderPage } = require('../page-objects/rider-page')

// Full marketplace + rider delivery E2E flow.
// Uses manager auth for marketplace ordering (user_metadata.phone is set).

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

    // Track the place-order POST so we know when assignRider has been fired.
    const orderResponse = page.waitForResponse(
      (res) => /\/api\/(shop|marketplace)\/orders?/.test(res.url()) && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(() => null) // fall back to URL wait if route name differs

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

  test('vendor confirms a marketplace order if one exists', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')

    const orderRows = page.locator('button:has(> .flex-1)')
    await expect(orderRows.first().or(page.getByText(/no.*invoice|no.*order|empty/i))).toBeVisible()

    if ((await orderRows.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No marketplace orders to confirm — checkout test may have been skipped' })
      return
    }

    await orderRows.first().click()

    const confirmBtn = page.getByRole('button', { name: /confirm|accept order/i })
    await expect(confirmBtn).toBeVisible()
    page.on('dialog', dialog => dialog.accept())
    await confirmBtn.click()
    await expect(page.getByText('CONFIRMED')).toBeVisible()
  })

  test('rider picks up and delivers the marketplace order', async ({ page }) => {
    const rider = new RiderPage(page)

    // ── Step 1: Rider logs in ──────────────────────────────────────────
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.phone, TEST_RIDER.pin)
    expect(page.url()).toContain('/rider')
    expect(page.url()).not.toContain('/rider/login')

    // ── Step 2: Poll for assigned order via expect.poll ─────────────────
    // assignRider is fire-and-forget from checkout. expect.poll handles retry
    // with a single timeout instead of a hand-rolled 10×500ms loop.
    let currentOrder = null
    await expect.poll(async () => {
      const data = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
      if (data.current) currentOrder = data.current
      return Boolean(data.current)
    }, { timeout: 10000, message: 'Rider was never assigned an order' }).toBe(true)

    expect(currentOrder.order_no).toMatch(/^MKT-/)

    await rider.refreshOrders()

    // ── Step 3: Accept order if Accept button is shown (auto-assign may or may not set OTP) ──
    if (await rider.acceptButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rider.acceptOrder()
      // Accept generates pickup OTP — re-fetch
      await expect.poll(async () => {
        const data = await page.evaluate(async () => {
          const res = await fetch('/api/rider/orders')
          return res.json()
        })
        if (data.current?.pickup_otp) currentOrder = data.current
        return Boolean(data.current?.pickup_otp)
      }, { timeout: 5000, message: 'Pickup OTP was not generated after Accept' }).toBe(true)
    }

    // ── Step 4: Confirm pickup with real OTP ───────────────────────────
    expect(currentOrder.pickup_otp).toBeTruthy()
    await rider.assertCanPickup()
    await rider.confirmPickup(currentOrder.pickup_otp)

    // Pickup generates delivery OTP — re-fetch
    await expect.poll(async () => {
      const data = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
      if (data.current?.delivery_otp) currentOrder = data.current
      return Boolean(data.current?.delivery_otp)
    }, { timeout: 5000, message: 'Delivery OTP was not generated after pickup' }).toBe(true)

    // ── Step 5: Confirm delivery with real OTP ─────────────────────────
    await rider.assertCanDeliver()
    await rider.confirmDelivery(currentOrder.delivery_otp)

    // ── Step 6: Submit delivery fee via API ─────────────────────────────
    // After delivery, the rider is freed (current_order_id = null) so the fee
    // form disappears from the dashboard. Submit fee via API directly.
    const feeRes = await page.evaluate(async (orderId) => {
      const res = await fetch(`/api/rider/orders/${orderId}/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_fee: 50 }),
      })
      return { ok: res.ok, status: res.status }
    }, currentOrder.id)

    expect(feeRes.ok).toBeTruthy()
  })
})
