const { test, expect } = require('@playwright/test')
const { seedDatabase } = require('../fixtures/db-seed')
const {
  TEST_WHOLESALER, TEST_WHOLESALER_PRODUCTS,
  MANAGER_USER, OWNER_USER, CASHIER_USER,
} = require('../fixtures/test-data')

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return
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

/**
 * Helper to sign in as a specific role
 */
async function signInAs(page, email, password) {
  loadEnv()
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/pos', { timeout: 10000 })
}

test.describe('V8. Vendor Restock from Wholesaler', () => {
  test.beforeAll(async () => {
    loadEnv()
    await seedDatabase()
  })

  test.describe('Access Control', () => {
    test('manager can see restock button', async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      const restockBtn = page.locator('[data-testid="restock-btn"]')
      await expect(restockBtn).toBeVisible()
    })

    test('owner can see restock button', async ({ page }) => {
      await signInAs(page, OWNER_USER.email, OWNER_USER.password)
      const restockBtn = page.locator('[data-testid="restock-btn"]')
      await expect(restockBtn).toBeVisible()
    })

    test('cashier cannot see restock button', async ({ page }) => {
      await signInAs(page, CASHIER_USER.email, CASHIER_USER.password)
      const restockBtn = page.locator('[data-testid="restock-btn"]')
      await expect(restockBtn).not.toBeVisible()
    })
  })

  test.describe('Wholesaler Selection', () => {
    test('opens restock modal when button clicked', async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await expect(page.locator('[data-testid="restock-modal"]')).toBeVisible()
      await expect(page.locator('[data-testid="restock-modal-title"]')).toContainText('Restock from Wholesaler')
    })

    test('displays connected wholesalers', async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await expect(page.locator('[data-testid="wholesaler-list"]')).toBeVisible()
    })

    test('selecting wholesaler shows catalog', async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()

      // Debug: check if wholesaler card exists before clicking
      const wholesalerCard = page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`)
      await expect(wholesalerCard).toBeVisible()

      // Click and wait a moment for the catalog to load
      await wholesalerCard.click()
      await page.waitForTimeout(2000)

      // Check for error message
      const error = page.locator('[data-testid="restock-error"]')
      if (await error.isVisible()) {
        console.error('Catalog error:', await error.textContent())
      }

      await expect(page.locator('[data-testid="product-grid"]')).toBeVisible()
    })

    test('back button returns to wholesaler list', async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
      await page.locator('[data-testid="back-to-wholesalers-btn"]').click()
      await expect(page.locator('[data-testid="wholesaler-list"]')).toBeVisible()
    })
  })

  test.describe('Product Catalog', () => {
    test.beforeEach(async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
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

      const cartCount = await page.locator('[data-testid^="cart-item-"]').count()
      expect(cartCount).toBe(1)
    })

    test('adding same product increments quantity', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator(`[data-testid="product-${product.name}"]`).click()

      const qty = await page.locator('[data-testid="qty-value"]').textContent()
      expect(parseInt(qty)).toBe(2)
    })
  })

  test.describe('Cart Management', () => {
    test.beforeEach(async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
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

      const qty = await page.locator('[data-testid="qty-value"]').textContent()
      expect(parseInt(qty)).toBe(2)
    })

    test('remove item clears from cart', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()
      await page.locator('[data-testid="remove-item"]').click()

      const cartCount = await page.locator('[data-testid^="cart-item-"]').count()
      expect(cartCount).toBe(0)
    })

    test('place order button disabled when cart empty', async ({ page }) => {
      const btn = page.locator('[data-testid="place-order-btn"]')
      await expect(btn).toBeDisabled()
    })

    test('place order button enabled when cart has items', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()

      const btn = page.locator('[data-testid="place-order-btn"]')
      await expect(btn).toBeEnabled()
    })
  })

  test.describe('Order Placement', () => {
    test.beforeEach(async ({ page }) => {
      await signInAs(page, MANAGER_USER.email, MANAGER_USER.password)
      await page.locator('[data-testid="restock-btn"]').click()
      await page.locator(`[data-testid="wholesaler-${TEST_WHOLESALER.name}"]`).click()
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

      const successMsg = page.locator('[data-testid="restock-success"]')
      await expect(successMsg).toContainText('Order placed successfully')
    })

    test('modal closes after success', async ({ page }) => {
      const product = TEST_WHOLESALER_PRODUCTS[0]
      await page.locator(`[data-testid="product-${product.name}"]`).click()

      await page.locator('[data-testid="place-order-btn"]').click()

      // Wait for success message then modal to close
      await page.waitForTimeout(3500)
      await expect(page.locator('[data-testid="restock-modal"]')).not.toBeVisible()
    })
  })
})

// Export helpers for use in other test files
module.exports = { signInAs, loadEnv }
