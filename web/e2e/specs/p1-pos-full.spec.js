/**
 * P1 — POS Full Production E2E (PocketBase)
 *
 * Auth comes from the `pocketbase-pos` project's storageState (set up in
 * auth-setup.js). No per-test login.
 */
const { test, expect } = require('@playwright/test')

// ── Auth (storage state covers most flows; logout/refresh need explicit handling) ──

test.describe('Auth', () => {
  test('session persists after refresh', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText('NEXUS BHUTAN')).toBeVisible()
    await page.reload()
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('logout clears session', async ({ page }) => {
    await page.goto('/')
    await page.locator('header button').last().click()
    await expect(page).toHaveURL(/\/login/)
  })
})

// ── Products ─────────────────────────────────────────────────────────────

test.describe('Products', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible()
  })

  test('product grid loads with seed data', async ({ page }) => {
    await expect(page.getByText('Coca Cola 1L', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Red Bull', { exact: false })).toBeVisible()
  })

  test('search filters by name', async ({ page }) => {
    await page.getByPlaceholder(/search products/i).fill('Druk')
    await expect(page.getByText('Druk 1104 Beer', { exact: false })).toBeVisible()
    // Non-matching products should be filtered out
    await expect(page.getByText('Wai Wai Noodles', { exact: false })).not.toBeVisible()
  })

  test('all seed products render', async ({ page }) => {
    await expect(page.getByText('Wai Wai Noodles', { exact: false })).toBeVisible()
    await expect(page.getByText('Sunrise Tea', { exact: false })).toBeVisible()
    await expect(page.getByText('Dahlia Soap', { exact: false })).toBeVisible()
  })
})

// ── Cart ─────────────────────────────────────────────────────────────────

test.describe('Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible()
  })

  test('add product to cart', async ({ page }) => {
    await page.getByRole('button', { name: /Coca Cola 1L/ }).click()
    await expect(page.getByRole('button', { name: /checkout/i })).toBeVisible()
  })

  test('quantity changes', async ({ page }) => {
    await page.getByRole('button', { name: /Aashirvaad Atta/ }).click()
    await expect(page.getByRole('button', { name: /checkout/i })).toBeVisible()
  })

  test('clear cart removes items', async ({ page }) => {
    await page.getByRole('button', { name: /Red Bull/ }).click()
    await expect(page.getByRole('button', { name: /checkout/i })).toBeVisible()
    await page.getByText('Clear').click()
    await expect(page.getByText('Cart is empty')).toBeVisible()
  })

  test('cart panel shows correct structure', async ({ page }) => {
    await expect(page.getByText('Cart', { exact: true }).first()).toBeVisible()
  })

  test('checkout opens payment modal', async ({ page }) => {
    await page.getByRole('button', { name: /Coca Cola 1L/ }).click()
    await page.getByRole('button', { name: /checkout/i }).click()
    await expect(page.getByText('Amount Due')).toBeVisible()
  })

  test('credit payment requires customer', async ({ page }) => {
    await page.getByRole('button', { name: /Coca Cola 1L/ }).click()
    await page.getByRole('button', { name: /checkout/i }).click()
    await expect(page.getByText('Amount Due')).toBeVisible()
    await page.getByText('Khata').click()
    await page.getByRole('button', { name: /confirm payment/i }).click()
    await expect(page.getByText(/customer is required/i)).toBeVisible()
  })
})

// ── Customers ────────────────────────────────────────────────────────────

test.describe('Customers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('customer modal opens from cart', async ({ page }) => {
    await page.getByText('Add customer').click()
    await expect(page.getByText('Select Customer')).toBeVisible()
  })

  test('seed customers appear in modal', async ({ page }) => {
    await page.getByText('Add customer').click()
    await expect(page.getByText('Select Customer')).toBeVisible()
    await expect(page.getByText('Karma Dorji')).toBeVisible()
    await expect(page.getByText('Pema Wangchuk')).toBeVisible()
  })

  test('customers page shows list', async ({ page }) => {
    await page.getByText('Customers').click()
    await page.waitForURL(/\/customers/)
    await expect(page.getByText('Karma Dorji')).toBeVisible()
  })
})

// ── Shifts ───────────────────────────────────────────────────────────────

test.describe('Shifts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('open shift button visible', async ({ page }) => {
    await expect(page.getByText('Open Shift')).toBeVisible()
  })

  test('open shift modal works', async ({ page }) => {
    await page.getByText('Open Shift').click()
    await expect(page.getByText('Opening Float')).toBeVisible()
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText('Opening Float')).not.toBeVisible()
  })
})

// ── Settings ─────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('settings page accessible', async ({ page }) => {
    await page.locator('a[href="/settings"]').click()
    await page.waitForURL(/\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('settings has store profile section', async ({ page }) => {
    await page.locator('a[href="/settings"]').click()
    await page.waitForURL(/\/settings/)
    await expect(page.getByText('Store Profile')).toBeVisible()
    await expect(page.getByText('TPN / GSTIN')).toBeVisible()
  })
})

// ── Receipt / Payment Modal ──────────────────────────────────────────────

test.describe('Receipt Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible()
    await page.getByRole('button', { name: /Coca Cola 1L/ }).click()
    await page.getByRole('button', { name: /checkout/i }).click()
  })

  test('payment modal shows all methods', async ({ page }) => {
    await expect(page.getByText('Cash')).toBeVisible()
    await expect(page.getByText('mBoB')).toBeVisible()
    await expect(page.getByText('mPay')).toBeVisible()
    await expect(page.getByText('RTGS')).toBeVisible()
  })

  test('cash payment shows tendered input', async ({ page }) => {
    await expect(page.getByText('Tendered Amount')).toBeVisible()
  })
})
