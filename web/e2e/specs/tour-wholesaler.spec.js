const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Wholesaler console. Sign in, land on the console, then walk Warehouses and Catalog.
// Fresh context; overlays baked into the recording.

async function slowType(loc, text, delay = 80) { await loc.click(); await loc.pressSequentially(text, { delay }) }

test('TOUR — Wholesaler: sign in and tour the console', async ({ page }) => {
  test.setTimeout(160_000)
  await installTour(page)

  // 1) Sign in under the Staff tab.
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'Supply Chain · Wholesaler',
    title: 'The wholesaler console',
    sub: 'Stock warehouses, supply retailers, and restock from distributors.',
  })
  await caption(page, { step: 1, title: 'Sign in', text: 'Staff sign in with their email and password under the Staff tab.' })
  await page.getByRole('button', { name: 'Staff' }).click()
  await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible' })
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.wholesaler.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.wholesaler.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/wholesaler', { timeout: 30000 }); await beat(page, 1600)

  // 2) The console lands with its section tiles.
  await caption(page, { step: 2, title: 'Wholesaler Console', text: 'Warehouses, retailers, orders, and restocking — one dashboard.' })
  await expect(page.getByRole('heading', { name: 'Wholesaler Console' })).toBeVisible({ timeout: 15000 }); await beat(page, 1800)

  // 3) Warehouses.
  await caption(page, { step: 3, title: 'Warehouses', text: 'Wholesalers hold stock in depots — not a shop counter.' })
  await page.locator('nav').getByRole('link', { name: 'Warehouses' }).click()
  await expect(page).toHaveURL(/\/wholesaler\/warehouses/, { timeout: 15000 }); await beat(page, 2000)

  // 4) Catalog.
  await caption(page, { step: 4, title: 'Your catalog', text: 'The wholesale products retailers order at wholesale rates.' })
  await page.locator('nav').getByRole('link', { name: 'Catalog' }).click()
  await expect(page).toHaveURL(/\/wholesaler\/catalog/, { timeout: 15000 }); await beat(page, 2200)

  // 5) Done.
  await caption(page, { step: 5, title: 'The middle tier', text: 'Wholesalers buy from distributors and supply the retailers below them.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
