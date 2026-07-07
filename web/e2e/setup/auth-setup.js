const { test: base, expect } = require('@playwright/test')
const { TEST_USERS, VENDOR_USERS } = require('../fixtures/test-data')

const test = base.extend({})

test.describe('Auth Setup', () => {
  const roles = [
    { key: 'retailer', user: TEST_USERS[2], file: 'e2e/storage/retailer-auth.json' },
    { key: 'cashier', user: TEST_USERS[0], file: 'e2e/storage/cashier-auth.json' },
    { key: 'manager', user: TEST_USERS[1], file: 'e2e/storage/manager-auth.json' },
    // OWNER is the same user as retailer; v6 references owner-auth.json for clarity.
    { key: 'owner', user: TEST_USERS[2], file: 'e2e/storage/owner-auth.json' },
    // B2B supply-chain roles (vendor accounts) — land on their own consoles.
    { key: 'distributor', user: VENDOR_USERS.distributor, file: 'e2e/storage/distributor-auth.json' },
    { key: 'wholesaler', user: VENDOR_USERS.wholesaler, file: 'e2e/storage/wholesaler-auth.json' },
  ]

  for (const { key, user, file } of roles) {
    test(`sign in as ${key} and save storage state`, async ({ page }) => {
      await page.goto('/login')
      // Customer is the default tab now; staff sign in under the Staff tab.
      await page.getByRole('button', { name: 'Staff' }).click()
      await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible' })

      await page.getByPlaceholder('you@business.bt').fill(user.email)
      await page.getByPlaceholder('••••••••').fill(user.password)
      await page.getByRole('button', { name: /sign in/i }).click()
      // Wait until redirected off /login to the role's home (/pos for retailer
      // roles, /distributor or /wholesaler for B2B roles) — role-agnostic.
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })
      await page.context().storageState({ path: file })
    })
  }

  // PocketBase backend uses a different login form (id="email") and the
  // admin credentials seeded by setup-pb.js. Skipped if PocketBase isn't
  // reachable — p1 specs will fail loudly, which is what we want.
  test('sign in to PocketBase admin and save storage state', async ({ page }) => {
    try {
      await page.goto('/login', { timeout: 5000 })
    } catch {
      test.skip(true, 'Login page unreachable — PocketBase not running')
      return
    }
    const emailField = page.locator('#email')
    if (!(await emailField.isVisible().catch(() => false))) {
      test.skip(true, 'PocketBase login form not present (Supabase mode?)')
      return
    }
    await emailField.fill('admin@pos.local')
    await page.locator('#password').fill('admin12345')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    await page.context().storageState({ path: 'e2e/storage/pocketbase-auth.json' })
  })
})
