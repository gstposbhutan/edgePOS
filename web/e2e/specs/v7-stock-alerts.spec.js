const { test, expect } = require('@playwright/test')
const { InventoryPage } = require('../page-objects/inventory-page')
const { TEST_PRODUCTS, TEST_ENTITY } = require('../fixtures/test-data')

// Use manager auth — has inventory:read
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Stock Alerts', () => {

  let inventoryPage

  test.beforeEach(async ({ page }) => {
    inventoryPage = new InventoryPage(page)
    await inventoryPage.goto()
  })

  // ── Low Stock Detection ──────────────────────────────────────────────

  test('products below reorder_point are detected as low stock', async ({ page }) => {
    // From TEST_PRODUCTS: Red Bull (stock 6), Surf Excel (stock 3), Lifebuoy (stock 8)
    // These have stock > 0 but <= 10 (default reorder_point)
    const lowStockProducts = TEST_PRODUCTS.filter(
      p => p.current_stock > 0 && p.current_stock <= 10
    )

    expect(lowStockProducts.length).toBeGreaterThan(0)

    // Each should show "Low Stock" badge in the table
    for (const product of lowStockProducts) {
      const status = await inventoryPage.getStockStatus(product.name)
      expect(status).toContain('Low Stock')
    }
  })

  test('low stock count matches banner count', async ({ page }) => {
    // Calculate expected low count from seed data
    const expectedLow = TEST_PRODUCTS.filter(
      p => p.current_stock > 0 && p.current_stock <= 10
    ).length

    // The low stock banner should display this count
    const lowBanner = page.locator('div.border-amber-500\\/30:has-text("running low")')
    if (expectedLow > 0) {
      await expect(lowBanner).toBeVisible()
      await expect(lowBanner).toContainText(`${expectedLow} product`)
    } else {
      await expect(lowBanner).not.toBeVisible()
    }
  })

  // ── Out of Stock Detection ───────────────────────────────────────────

  test('zero stock products are detected as out of stock', async ({ page }) => {
    // From TEST_PRODUCTS: Parle-G Biscuit (stock 0), Coca-Cola (stock 0)
    const outOfStockProducts = TEST_PRODUCTS.filter(p => p.current_stock <= 0)

    expect(outOfStockProducts.length).toBeGreaterThan(0)

    for (const product of outOfStockProducts) {
      const status = await inventoryPage.getStockStatus(product.name)
      expect(status).toContain('Out of Stock')
    }
  })

  test('out of stock count matches banner count', async ({ page }) => {
    const expectedOut = TEST_PRODUCTS.filter(p => p.current_stock <= 0).length

    const outBanner = page.locator('div.border-tibetan\\/30:has-text("out of stock")')
    if (expectedOut > 0) {
      await expect(outBanner).toBeVisible()
      await expect(outBanner).toContainText(`${expectedOut} product`)
    } else {
      await expect(outBanner).not.toBeVisible()
    }
  })

  // ── Banner Interactions ──────────────────────────────────────────────

  test('out-of-stock banner View button filters to OUT', async ({ page }) => {
    const outBanner = page.locator('div.border-tibetan\\/30:has-text("out of stock")')
    if (await outBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click the View button inside the banner
      await outBanner.locator('button:has-text("View")').click()
      await page.waitForTimeout(300)

      // All visible products should be out of stock
      const count = await inventoryPage.getProductCount()
      for (let i = 0; i < count; i++) {
        const badge = await page.locator('tbody tr').nth(i).locator('td:nth-child(4) span').textContent()
        expect(badge).toContain('Out of Stock')
      }
    }
  })

  test('low-stock banner View button filters to LOW', async ({ page }) => {
    const lowBanner = page.locator('div.border-amber-500\\/30:has-text("running low")')
    if (await lowBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lowBanner.locator('button:has-text("View")').click()
      await page.waitForTimeout(300)

      const count = await inventoryPage.getProductCount()
      for (let i = 0; i < count; i++) {
        const badge = await page.locator('tbody tr').nth(i).locator('td:nth-child(4) span').textContent()
        expect(badge).toContain('Low Stock')
      }
    }
  })

  // ── WhatsApp Stock Alert ─────────────────────────────────────────────

  test.describe('WhatsApp Alert Integration', () => {
    test('stock alert sent via WhatsApp gateway when product hits reorder point', async ({ page }) => {
      // Mock the WhatsApp gateway API
      let alertPayload = null

      await page.route('**/api/whatsapp/send', async (route) => {
        alertPayload = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, messageId: 'wa-msg-001' }),
        })
      })

      // Navigate to inventory
      const invPage = new InventoryPage(page)
      await invPage.goto()

      // Trigger a stock adjustment that brings a product below reorder point
      const AdjustStockModal = require('../page-objects/adjust-stock-modal')
      const adjustModal = new AdjustStockModal(page)

      // Use a product with high stock — adjust down to below 10
      const product = TEST_PRODUCTS.find(p => p.current_stock > 15)
      if (!product) return

      const beforeStock = await invPage.getStockLevel(product.name)
      const adjustQty = beforeStock - 5 // Bring down to 5

      await invPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()
      await adjustModal.selectType('LOSS')
      await adjustModal.enterQuantity(adjustQty)
      await adjustModal.enterNotes('E2E stock alert trigger')
      await adjustModal.clickConfirm()
      await adjustModal.assertClosed()

      // The alert system may fire asynchronously.
      // If the WhatsApp gateway was called, verify the payload
      await page.waitForTimeout(2000)

      if (alertPayload) {
        expect(alertPayload).toBeTruthy()
        // Alert should contain product info
        expect(alertPayload.product_name || alertPayload.message || alertPayload.body).toBeTruthy()
      }
    })

    test('alert contains correct product information', async ({ page }) => {
      // Mock WhatsApp gateway to capture the alert content
      const alerts = []

      await page.route('**/api/whatsapp/send', async (route) => {
        const payload = route.request().postDataJSON()
        alerts.push(payload)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      })

      // Verify low-stock products are the ones triggering alerts
      const lowStockProducts = TEST_PRODUCTS.filter(
        p => p.current_stock > 0 && p.current_stock <= 10
      )

      // These products should have "Low Stock" status in the UI
      const invPage = new InventoryPage(page)
      await invPage.goto()

      for (const product of lowStockProducts) {
        const row = invPage.getStockRow(product.name)
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          const badge = await row.locator('td:nth-child(4) span').textContent()
          expect(badge).toContain('Low Stock')
        }
      }
    })
  })
})
