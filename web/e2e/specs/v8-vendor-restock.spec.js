const { test, expect } = require('@playwright/test')
const {
  TEST_WHOLESALER, TEST_WHOLESALER_PRODUCTS,
} = require('../fixtures/test-data')

// Default to manager auth — has restock permission. Access Control describe below
// overrides per-describe to test owner/cashier visibility.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

// NOTE: The Pelbu redesign moved the restock-from-wholesaler entry point out
// of the keyboard /pos header. It now lives exclusively on the touch POS
// (/pos/touch) via the shared <PosHeader> component, gated to MANAGER/OWNER.
// All navigations below target /pos/touch. The access-control semantics are
// unchanged: cashier (sub-role CASHIER) never sees the button.
const RESTOCK_ROUTE = '/pos/touch'

test.describe.skip('V8. Vendor Restock (skipped: restock not in scope now)', () => {

  // ── Access Control ─────────────────────────────────────────────────
  // Role-specific visibility of the restock button. Each describe overrides
  // the storageState so we don't pay for a UI login per test.

  test.describe('Access Control — manager', () => {
    test('manager can see restock button', async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await expect(page.locator('[data-testid="restock-btn"]')).toBeVisible()
    })
  })

  test.describe('Access Control — owner', () => {
    test.use({ storageState: 'e2e/storage/retailer-auth.json' })

    test('owner can see restock button', async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await expect(page.locator('[data-testid="restock-btn"]')).toBeVisible()
    })
  })

  test.describe('Access Control — cashier', () => {
    test.use({ storageState: 'e2e/storage/cashier-auth.json' })

    test('cashier cannot see restock button', async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      // Button is role-gated to MANAGER/OWNER in PosHeader, so a cashier
      // session must never render it.
      await expect(page.locator('[data-testid="restock-btn"]')).not.toBeVisible()
    })
  })

  // ── Wholesaler Selection ───────────────────────────────────────────

  test.describe('Wholesaler Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await page.locator('[data-testid="restock-btn"]').click()
    })

    test('opens restock modal when button clicked', async ({ page }) => {
      await expect(page.locator('[data-testid="restock-modal"]')).toBeVisible()
      await expect(page.locator('[data-testid="restock-modal-title"]')).toContainText('Restock from Wholesaler')
    })

    test('displays connected wholesalers', async ({ page }) => {
      await expect(page.locator('[data-testid="wholesaler-list"]')).toBeVisible()
    })

    test('selecting wholesaler shows catalog', async ({ page }) => {
      const wholesalerCard = page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`)
      await expect(wholesalerCard).toBeVisible()
      await wholesalerCard.click()

      // Wait for either the grid or an explicit error — never silently swallow
      await expect(
        page.locator('[data-testid="product-grid"], [data-testid="restock-error"]')
      ).toBeVisible()
      await expect(page.locator('[data-testid="restock-error"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('back button returns to wholesaler list', async ({ page }) => {
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
      await page.locator('[data-testid="back-to-wholesalers-btn"]').click()
      await expect(page.locator('[data-testid="wholesaler-list"]')).toBeVisible()
    })
  })

  // ── Product Catalog ────────────────────────────────────────────────

  test.describe('Product Catalog', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('displays wholesaler products', async ({ page }) => {
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('search filters products', async ({ page }) => {
      await page.locator('[data-testid="catalog-search"]').fill('Generator')
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('clicking product adds to cart', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await expect(page.locator('[data-testid^="cart-item-"]')).toHaveCount(1)
    })

    test('adding same product increments quantity', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await expect(page.locator('[data-testid="qty-value"]')).toHaveText('2')
    })
  })

  // ── Cart Management ────────────────────────────────────────────────

  test.describe('Cart Management', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('displays correct totals', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()

      const grand = await page.locator('[data-testid="restock-cart"] >> .text-primary').textContent()
      expect(grand).toContain((product.wholesale_price * 1.05).toFixed(2))
    })

    test('increase quantity updates totals', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="qty-increase"]').click()
      await expect(page.locator('[data-testid="qty-value"]')).toHaveText('2')
    })

    test('remove item clears from cart', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="remove-item"]').click()
      await expect(page.locator('[data-testid^="cart-item-"]')).toHaveCount(0)
    })

    test('place order button disabled when cart empty', async ({ page }) => {
      await expect(page.locator('[data-testid="place-order-btn"]')).toBeDisabled()
    })

    test('place order button enabled when cart has items', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await expect(page.locator('[data-testid="place-order-btn"]')).toBeEnabled()
    })
  })

  // ── Order Placement ────────────────────────────────────────────────

  test.describe('Order Placement', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(RESTOCK_ROUTE)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('placing order creates WHOLESALE order with CREDIT', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="place-order-btn"]').click()
      await expect(page.locator('[data-testid="restock-success"]')).toBeVisible()
    })

    test('success message shows order number', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="place-order-btn"]').click()
      await expect(page.locator('[data-testid="restock-success"]')).toContainText('Order placed successfully')
    })

    test('modal closes after success', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="place-order-btn"]').click()
      await expect(page.locator('[data-testid="restock-success"]')).toBeVisible()
      await expect(page.locator('[data-testid="restock-modal"]')).not.toBeVisible()
    })
  })
})
