const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Distributor console. Sign in (staff email + password), land on the console,
// then walk the Catalog and Retailers sections. Fresh context; overlays baked into the recording.

async function slowType(loc, text, delay = 80) { await loc.click(); await loc.pressSequentially(text, { delay }) }

test('TOUR — Distributor: sign in and tour the console', async ({ page }) => {
  test.setTimeout(160_000)
  await installTour(page)

  // 1) Sign in under the Staff tab.
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'Supply Chain · Distributor',
    title: 'The distributor console',
    sub: 'Supply wholesalers and retailers, and manage your catalog and team.',
  })
  await caption(page, { step: 1, title: 'Sign in', text: 'Staff sign in with their email and password under the Staff tab.' })
  await page.getByRole('button', { name: 'Staff' }).click()
  await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible' })
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.distributor.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.distributor.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/distributor', { timeout: 30000 }); await beat(page, 1600)

  // 2) The console lands with its section tiles.
  await caption(page, { step: 2, title: 'Distributor Console', text: 'Catalog, retailers, wholesalers, orders — each tier in one place.' })
  await expect(page.getByRole('heading', { name: 'Distributor Console' })).toBeVisible({ timeout: 15000 }); await beat(page, 1800)

  // 3) The product catalog.
  await caption(page, { step: 3, title: 'Your catalog', text: 'The products this distributor stocks and supplies downstream.' })
  await page.locator('nav').getByRole('link', { name: 'Catalog' }).click()
  await expect(page).toHaveURL(/\/distributor\/catalog/, { timeout: 15000 }); await beat(page, 2000)

  // 4) Retailers to supply.
  await caption(page, { step: 4, title: 'Retailers', text: 'Browse retailers, save favourites, and supply them with stock.' })
  await page.locator('nav').getByRole('link', { name: 'Retailers' }).click()
  await expect(page).toHaveURL(/\/distributor\/retailers/, { timeout: 15000 }); await beat(page, 2200)

  // 5) Done.
  await caption(page, { step: 5, title: 'The full supply chain', text: 'Distributors sit at the top — feeding wholesalers, retailers, and shoppers.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
