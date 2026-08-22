const { test, expect } = require('@playwright/test')
const { TEST_USERS } = require('../fixtures/test-data')

const CASHIER_USER = TEST_USERS[0] // CASHIER sub_role

// Routes that CASHIER should be redirected away from. These pages guard
// themselves CLIENT-SIDE: each reads subRole via getUser() and, when it is
// 'CASHIER', calls router.push('/pos') in a useEffect (see e.g.
// app/pos/purchases/page.jsx, app/pos/products/page.jsx). proxy.js does NOT
// cashier-gate these routes — it only redirects unauthenticated users to
// /login. So the expected terminal URL for a logged-in cashier is /pos.
const RESTRICTED_ROUTES = [
  { path: '/pos/purchases', name: 'Purchases list' },
  { path: '/pos/purchases/new', name: 'New purchase' },
  { path: '/pos/products', name: 'Products' },
  { path: '/pos/inventory', name: 'Inventory' },
  { path: '/pos/khata', name: 'Khata' },
  { path: '/pos/registers', name: 'Cash registers' },
]

// Header nav buttons rendered by app/pos/page.jsx, gated behind
// `subRole !== 'CASHIER'`. Each is a shadcn <Button> (renders a <button>) with
// a `title` attr — these are the exact title strings from the source.
const RESTRICTED_NAV_TITLES = ['Purchases', 'Products', 'Inventory', 'Khata', 'Cash Registers']

// Navigate to /pos and confirm the cashier session is actually live BEFORE
// any access-control assertion runs. When the saved storageState
// (e2e/storage/cashier-auth.json) holds an expired Supabase access token,
// proxy.js' getUser() returns null and every /pos* route 307-redirects to
// /login?redirect=... — which would make all 16 access-control tests fail
// with a misleading "redirected from X" error instead of the real cause.
// This guard fails fast with an actionable message pointing at the fixture.
async function assertCashierAuthenticated(page) {
  await page.goto('/pos')
  // The keyboard POS header renders once the cashier is recognised. Waiting on
  // a header-only button (always shown regardless of subRole) proves the page
  // actually rendered, not the /login fallback.
  await expect(page.locator('button[title="Sign out"]')).toBeVisible({ timeout: 15000 })
  expect(page.url(), 'cashier was bounced to login — cashier-auth.json token is likely expired; regenerate via the auth-setup project').not.toContain('/login')
}

test.describe('Cashier Access Restriction', () => {
  test.use({ storageState: 'e2e/storage/cashier-auth.json' })

  test('cashier can access POS home', async ({ page }) => {
    await assertCashierAuthenticated(page)
    expect(page.url()).toContain('/pos')
    expect(page.url()).not.toContain('/login')
  })

  test('cashier can access orders page (POS section only)', async ({ page }) => {
    await assertCashierAuthenticated(page)
    await page.goto('/pos/orders')
    // Wait for the orders page to settle past any client-side redirect.
    await page.waitForURL('**/pos/orders', { timeout: 10000 }).catch(() => {})
    expect(page.url()).toContain('/pos/orders')
    // Cashiers are NOT redirected away from /pos/orders, but the "Sales" section
    // tab is gated by `subRole !== 'CASHIER'` (app/pos/orders/page.jsx:134) and
    // effectiveSection is forced to 'POS' for cashiers (line 45). The Sales tab
    // button's text is exactly "Sales".
    const salesTab = page.locator('button', { hasText: /^Sales$/ })
    await expect(salesTab).not.toBeVisible({ timeout: 5000 })
  })

  for (const route of RESTRICTED_ROUTES) {
    test(`cashier is redirected from ${route.name} (${route.path})`, async ({ page }) => {
      await assertCashierAuthenticated(page)
      await page.goto(route.path)
      // Cashier restriction is enforced CLIENT-SIDE in each page's useEffect
      // (e.g. `if (subRole === 'CASHIER') router.push('/pos')`), not in proxy.js.
      // The redirect fires after getUser() resolves, so wait for the URL to settle.
      await page.waitForURL('**/pos', { timeout: 10000 }).catch(() => {})
      expect(page.url()).toMatch(/\/pos$/)
    })
  }

  test('cashier does not see restricted nav buttons in keyboard POS', async ({ page }) => {
    await assertCashierAuthenticated(page)

    // The keyboard POS header renders management nav as icon-only buttons
    // (identified by their `title` attribute), and only when subRole !== 'CASHIER'
    // (see app/pos/page.jsx:530-548). Assert these titled buttons are absent for
    // a cashier. toBeHidden waits for the element to settle rather than throwing
    // immediately if the DOM is still hydrating.
    for (const title of RESTRICTED_NAV_TITLES) {
      await expect(page.locator(`button[title="${title}"]`)).toBeHidden({ timeout: 5000 })
    }
  })
})
