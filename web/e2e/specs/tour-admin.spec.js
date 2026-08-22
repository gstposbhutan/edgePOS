const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Super-admin platform console. Sign in, view the dashboard, then walk
// Riders, the Desktop App releases, and Entities. Fresh context; overlays baked into the recording.

async function slowType(loc, text, delay = 80) { await loc.click(); await loc.pressSequentially(text, { delay }) }

test('TOUR — Super Admin: sign in and tour the platform console', async ({ page }) => {
  test.setTimeout(170_000)
  await installTour(page)

  // 1) Sign in under the Staff tab.
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'Platform · Super Admin',
    title: 'The platform console',
    sub: 'Riders, featured shops, desktop releases — the whole ecosystem.',
  })
  await caption(page, { step: 1, title: 'Sign in', text: 'The platform operator signs in with their staff account.' })
  await page.getByRole('button', { name: 'Staff' }).click()
  await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible' })
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.admin.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.admin.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/admin', { timeout: 30000 }); await beat(page, 1600)

  // 2) The dashboard.
  await caption(page, { step: 2, title: 'Platform dashboard', text: 'Live totals across the whole platform — team, products, orders, revenue.' })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 }); await beat(page, 1800)

  // 3) Riders — the delivery fleet.
  await caption(page, { step: 3, title: 'Riders', text: 'Add riders, toggle availability, and watch each rider’s queue depth.' })
  const sidebar = page.locator('aside')
  await sidebar.getByRole('link', { name: 'Riders' }).click()
  await expect(page).toHaveURL(/\/admin\/riders/, { timeout: 15000 }); await beat(page, 2000)

  // 4) Desktop App releases.
  await caption(page, { step: 4, title: 'Desktop releases', text: 'Publish a terminal version + notes; shops auto-update to it.' })
  await sidebar.getByRole('link', { name: 'Desktop App' }).click()
  await expect(page).toHaveURL(/\/admin\/releases/, { timeout: 15000 }); await beat(page, 2000)

  // 5) Entities — every business on the platform.
  await caption(page, { step: 5, title: 'Entities', text: 'Every distributor, wholesaler, retailer, and customer on the platform.' })
  await sidebar.getByRole('link', { name: 'Entities' }).click()
  await expect(page).toHaveURL(/\/admin\/entities/, { timeout: 15000 }); await beat(page, 2200)

  // 6) Done.
  await caption(page, { step: 6, title: 'The control room', text: 'One console governs riders, releases, featured shops, and GST reports.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
