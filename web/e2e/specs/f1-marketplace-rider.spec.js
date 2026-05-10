const { test, expect } = require('@playwright/test')
const {
  TEST_PRODUCTS, TEST_ENTITY, TEST_RIDER, MANAGER_USER
} = require('../fixtures/test-data')
const { RiderPage } = require('../page-objects/rider-page')

// Full marketplace + rider delivery E2E flow.
// Uses manager auth for marketplace ordering (user_metadata.phone is set).

test.describe('Marketplace + Rider Flow — Customer → Vendor → Rider → Customer', () => {

  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('customer browses shop, adds items, checks out with delivery', async ({ page }) => {
    // ── Step 1: Browse marketplace ──────────────────────────────────────
    await page.goto('/shop')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Wait for product grid — "Add to Cart" buttons
    const addButtons = page.getByRole('button', { name: /add to cart/i })
    await expect(addButtons.first()).toBeVisible({ timeout: 10000 })
    const buttonCount = await addButtons.count()
    expect(buttonCount).toBeGreaterThan(0)

    // ── Step 2: Add product to cart ────────────────────────────────────
    await addButtons.first().click()
    await page.waitForTimeout(1000)

    // Open cart drawer
    const cartIcon = page.getByRole('button').filter({ has: page.locator('svg.lucide-shopping-bag') })
    await cartIcon.click()
    await page.waitForTimeout(500)

    // Click "Checkout" in cart drawer
    const checkoutBtn = page.getByRole('button', { name: /checkout/i })
    await expect(checkoutBtn).toBeVisible({ timeout: 5000 })
    await checkoutBtn.click()

    // ── Step 3: Checkout ───────────────────────────────────────────────
    await page.waitForURL('**/shop/checkout**', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    const addressTextarea = page.getByPlaceholder(/enter your full delivery address/i)
    await expect(addressTextarea).toBeVisible({ timeout: 5000 })
    await addressTextarea.fill('Changzamtog, Thimphu, near swimming pool')

    const placeOrderBtn = page.getByRole('button', { name: /place order/i })
    await expect(placeOrderBtn).toBeEnabled({ timeout: 3000 })
    await placeOrderBtn.click()

    // ── Step 4: Verify order placed ────────────────────────────────────
    await page.waitForURL('**/shop/orders**', { timeout: 15000 })
    expect(page.url()).toContain('/shop/orders')

    // Wait for fire-and-forget assignRider to complete
    await page.waitForTimeout(2000)
  })

  test('vendor sees marketplace orders tab', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')
    await page.waitForLoadState('networkidle')

    // Verify the marketplace tab is active
    const mktTab = page.getByRole('button', { name: /^marketplace$/i })
    await expect(mktTab).toBeVisible({ timeout: 10000 })

    // Verify page shows either orders or empty state
    const hasOrders = await page.locator('button:has(> .flex-1)').first().isVisible({ timeout: 3000 }).catch(() => false)
    const hasEmpty = await page.getByText(/no.*invoice|no.*order|empty/i).isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasOrders || hasEmpty).toBeTruthy()
  })

  test('vendor confirms a marketplace order if one exists', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const orderRows = page.locator('button:has(> .flex-1)')
    const rowCount = await orderRows.count()

    if (rowCount > 0) {
      await orderRows.first().click()
      await page.waitForLoadState('networkidle')

      const confirmBtn = page.getByRole('button', { name: /confirm|accept order/i })
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        page.on('dialog', dialog => dialog.accept())
        await confirmBtn.click()
        await page.waitForTimeout(2000)
        await expect(page.getByText('CONFIRMED')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('rider picks up and delivers the marketplace order', async ({ page }) => {
    const rider = new RiderPage(page)

    // ── Step 1: Rider logs in ──────────────────────────────────────────
    await rider.gotoLogin()
    await rider.login(TEST_RIDER.phone, TEST_RIDER.pin)
    expect(page.url()).toContain('/rider')
    expect(page.url()).not.toContain('/rider/login')

    // ── Step 2: Poll for assigned order ────────────────────────────────
    let currentOrder = null

    const data = await page.evaluate(async () => {
      const res = await fetch('/api/rider/orders')
      return res.json()
    })

    // assignRider is fire-and-forget from checkout — retry a few times
    for (let attempt = 0; attempt < 10; attempt++) {
      const refreshed = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
      if (refreshed.current) {
        currentOrder = refreshed.current
        break
      }
      await page.waitForTimeout(500)
    }

    // Rider must have been assigned the order from the checkout test
    expect(currentOrder).toBeTruthy()
    expect(currentOrder.order_no).toMatch(/^MKT-/)

    // Refresh dashboard to show the assigned order
    await rider.refreshOrders()
    await page.waitForTimeout(500)

    // ── Step 3: Accept order or confirm pickup ─────────────────────────
    // assignRider sets pickup_otp directly — so Confirm Pickup shows, not Accept.
    // But if auto-assign didn't set OTP, Accept button shows instead.
    const canAccept = await rider.acceptButton.isVisible({ timeout: 3000 }).catch(() => false)
    if (canAccept) {
      await rider.acceptOrder()
      await page.waitForTimeout(1000)
      // Accept generates pickup OTP — re-fetch
      const afterAccept = await page.evaluate(async () => {
        const res = await fetch('/api/rider/orders')
        return res.json()
      })
      if (afterAccept.current) currentOrder = afterAccept.current
    }

    // ── Step 4: Confirm pickup with real OTP ───────────────────────────
    const pickupOtp = currentOrder.pickup_otp
    expect(pickupOtp).toBeTruthy()

    await rider.assertCanPickup()
    await rider.confirmPickup(pickupOtp)
    await page.waitForTimeout(1000)

    // Pickup generates delivery OTP — re-fetch
    const afterPickup = await page.evaluate(async () => {
      const res = await fetch('/api/rider/orders')
      return res.json()
    })
    if (afterPickup.current) currentOrder = afterPickup.current

    // ── Step 5: Confirm delivery with real OTP ─────────────────────────
    const deliveryOtp = currentOrder.delivery_otp
    expect(deliveryOtp).toBeTruthy()

    await rider.assertCanDeliver()
    await rider.confirmDelivery(deliveryOtp)
    await page.waitForTimeout(1000)

    // ── Step 6: Submit delivery fee via API ─────────────────────────────
    // After delivery, the rider is freed (current_order_id = null) so the fee
    // form disappears from the dashboard. Submit fee via API directly.
    const feeRes = await page.evaluate(async (orderId) => {
      const res = await fetch(`/api/rider/orders/${orderId}/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_fee: 50 }),
      })
      return { ok: res.ok, status: res.status, data: await res.json() }
    }, currentOrder.id)

    expect(feeRes.ok).toBeTruthy()
  })
})
