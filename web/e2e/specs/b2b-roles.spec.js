const { test, expect } = require('@playwright/test')

// B2B supply-chain roles. The distributor & wholesaler consoles are role-routed
// (DISTRIBUTOR -> /distributor, WHOLESALER -> /wholesaler) and kept off /pos.
// These verify: login as the role lands on its console, the console heading +
// tiles render (each badged "Coming soon" — these consoles are deferred), and
// /pos is role-gated back to the console. video + slowMo via the b2b project.

test.describe('Distributor console', () => {
  test.use({ storageState: 'e2e/storage/distributor-auth.json' })

  test('distributor login lands on /distributor with heading + tiles', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/distributor/)
    await expect(page.getByRole('heading', { name: 'Distributor Console' })).toBeVisible({ timeout: 15000 })
    // tile labels (exact — the info sentence also names these roles)
    await expect(page.getByText('Wholesalers', { exact: true })).toBeVisible()
    await expect(page.getByText('Retailers', { exact: true })).toBeVisible()
    await expect(page.getByText('Catalog', { exact: true })).toBeVisible()
    // these consoles are deferred — every tile is badged "Coming soon"
    await expect(page.getByText('Coming soon').first()).toBeVisible()
  })

  test('distributor is role-gated away from /pos back to /distributor', async ({ page }) => {
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/distributor/)
  })
})

test.describe('Wholesaler console', () => {
  test.use({ storageState: 'e2e/storage/wholesaler-auth.json' })

  test('wholesaler login lands on /wholesaler with heading + tiles', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/wholesaler/)
    await expect(page.getByRole('heading', { name: 'Wholesaler Console' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Retailers', { exact: true })).toBeVisible()
    await expect(page.getByText('Warehouses', { exact: true })).toBeVisible()
    await expect(page.getByText('Catalog', { exact: true })).toBeVisible()
    await expect(page.getByText('Coming soon').first()).toBeVisible()
  })

  test('wholesaler is role-gated away from /pos back to /wholesaler', async ({ page }) => {
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/wholesaler/)
  })
})
