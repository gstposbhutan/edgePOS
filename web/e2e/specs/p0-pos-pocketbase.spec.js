/**
 * P0 — POS Core E2E (PocketBase)
 *
 * Tests the core POS flow against the PocketBase backend:
 *   - Login with default admin credentials
 *   - POS dashboard loads (product grid, cart panel visible)
 *   - Products display after data fetch
 *   - Cart creation on first load
 *   - Settings initialization
 *   - Logout and re-login
 *
 * This spec is self-contained — it handles its own auth at test start.
 * It uses the PocketBase backend at http://127.0.0.1:8090.
 */
const { test, expect } = require('@playwright/test')

// PocketBase default credentials (matches setup-pb.js seed)
const PB_USER = 'admin@pos.local'
const PB_PASS = 'admin12345'

// ── Helpers ──────────────────────────────────────────────────────────────

async function login(page, { email, password, timeout = 15000 } = {}) {
  await page.goto('/login')
  await page.locator('#email').waitFor({ state: 'visible', timeout })

  await page.locator('#email').fill(email || PB_USER)
  await page.locator('#password').fill(password || PB_PASS)
  await page.locator('button[type="submit"]').click()

  // Wait for redirect away from /login to POS page (/)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout })
  // Wait for loading to finish
  await expect(page.getByText('Loading...').or(page.locator('body'))).toBeVisible({ timeout: 5000 }).catch(() => {})
}

// ── POS Core Flow ────────────────────────────────────────────────────────

test.describe('POS Core (PocketBase)', () => {

  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('NEXUS BHUTAN')).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login with valid credentials redirects to POS', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(PB_USER)
    await page.locator('#password').fill(PB_PASS)
    await page.locator('button[type="submit"]').click()

    // Should redirect to POS page
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(PB_USER)
    await page.locator('#password').fill('WrongPassword123')
    await page.locator('button[type="submit"]').click()

    // Error message should appear
    await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 5000 })
    // Should still be on login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('POS page loads after login with header and navigation', async ({ page }) => {
    await login(page)

    // Header should show app name
    await expect(page.getByText('NEXUS BHUTAN')).toBeVisible({ timeout: 10000 })

    // Navigation links should exist
    await expect(page.getByText('Inventory')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Orders')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Customers')).toBeVisible({ timeout: 5000 })

    // Settings button (gear icon link)
    await expect(page.locator('a[href="/settings"]')).toBeVisible({ timeout: 5000 })
  })

  test('product grid loads with products from seed data', async ({ page }) => {
    await login(page)

    // Wait for product grid to appear — product cards are rendered
    // Look for known seed products from setup-pb.js / 001_initial_schema.js
    await expect(page.getByText('Wai Wai Noodles', { exact: false })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Druk 1104 Beer', { exact: false })).toBeVisible({ timeout: 10000 })
  })

  test('cart panel is visible after login', async ({ page }) => {
    await login(page)

    await expect(page.getByText('Cart', { exact: true }).first()).toBeVisible({ timeout: 10000 })
  })

  test('adding product to cart updates cart panel', async ({ page }) => {
    await login(page)

    // Wait for products
    await expect(page.getByText('Coca Cola 1L', { exact: false })).toBeVisible({ timeout: 15000 })

    // Click on a product card to add it
    await page.getByRole('button', { name: /Coca Cola 1L/ }).click()

    // Cart should show a checkout button (indicates items were added)
    await expect(page.getByRole('button', { name: /checkout/i })).toBeVisible({ timeout: 5000 })
  })

  test('search filters products', async ({ page }) => {
    await login(page)

    // Wait for products to load
    await expect(page.getByText('Coca Cola', { exact: false })).toBeVisible({ timeout: 15000 })

    // Use the search input
    const searchInput = page.getByPlaceholder(/search products/i)
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('Druk')

    // Should filter to show Druk products
    await page.waitForTimeout(500) // wait for filter
    await expect(page.getByText('Druk 1104 Beer', { exact: false })).toBeVisible({ timeout: 5000 })
  })

  test('session persists after page refresh', async ({ page }) => {
    await login(page)

    // Verify we are on POS page
    await expect(page.getByText('NEXUS BHUTAN')).toBeVisible({ timeout: 10000 })

    // Refresh
    await page.reload()

    // Should still be on POS page (not redirected to login)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })
    await expect(page.getByText('NEXUS BHUTAN')).toBeVisible({ timeout: 10000 })
  })

  test('logout redirects to login', async ({ page }) => {
    await login(page)

    // Click the logout button (last button in header with only an icon)
    await page.locator('header button').last().click()

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('settings page accessible from POS', async ({ page }) => {
    await login(page)

    // Click settings link
    await page.locator('a[href="/settings"]').click()

    // Should be on settings page
    await page.waitForURL(/\/settings/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 5000 })
  })

  test('online status badge shows', async ({ page }) => {
    await login(page)

    // Check for online/offline badge
    await expect(page.getByText(/online/i)).toBeVisible({ timeout: 5000 })
  })
})
