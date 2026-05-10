const { test, expect } = require('@playwright/test')
const { TEST_USERS } = require('../fixtures/test-data')

const CASHIER_USER = TEST_USERS[0] // CASHIER sub_role

// Routes that CASHIER should be redirected away from
const RESTRICTED_ROUTES = [
  { path: '/pos/purchases', name: 'Purchases list' },
  { path: '/pos/purchases/new', name: 'New purchase' },
  { path: '/pos/products', name: 'Products' },
  { path: '/pos/inventory', name: 'Inventory' },
  { path: '/pos/khata', name: 'Khata' },
  { path: '/pos/registers', name: 'Cash registers' },
]

test.describe('Cashier Access Restriction', () => {
  test.use({ storageState: 'e2e/storage/cashier-auth.json' })

  test('cashier can access POS home', async ({ page }) => {
    await page.goto('/pos')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/pos')
    // Should not be redirected away
    expect(page.url()).not.toContain('/login')
  })

  test('cashier can access orders page (POS section only)', async ({ page }) => {
    await page.goto('/pos/orders')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/pos/orders')
    // Sales tab should NOT be visible
    const salesTab = page.locator('button', { hasText: /^Sales$/ })
    await expect(salesTab).not.toBeVisible({ timeout: 5000 })
  })

  for (const route of RESTRICTED_ROUTES) {
    test(`cashier is redirected from ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      // Wait for redirect — should end up at /pos
      await page.waitForURL('**/pos', { timeout: 10000 }).catch(() => {})
      expect(page.url()).toMatch(/\/pos$/)
    })
  }

  test('cashier does not see restricted nav buttons in keyboard POS', async ({ page }) => {
    await page.goto('/pos')
    await page.waitForLoadState('networkidle')

    // These nav buttons should not exist for CASHIER
    const restrictedButtons = ['Purchases', 'Products', 'Inventory', 'Khata', 'Registers']
    for (const label of restrictedButtons) {
      const btn = page.locator('button', { hasText: new RegExp(`^${label}$`, 'i') })
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false)
      expect(visible).toBe(false)
    }
  })
})
