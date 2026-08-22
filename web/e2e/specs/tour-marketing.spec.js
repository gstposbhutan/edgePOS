const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Public marketing site (unauthenticated). Home → Features → Sell on Pelbu.
// Runs in the `tour` project's fresh (logged-out) context. Overlays baked into the recording.

const scrollTo = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y)

test('TOUR — Marketing: home, features, and selling on Pelbu', async ({ page }) => {
  test.setTimeout(150_000)
  await installTour(page)

  // 1) The public homepage.
  await page.goto('/'); await beat(page, 1000)
  await expect(page.getByRole('heading', { level: 1, name: /point of sale that sees what you sell/i })).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Public · Marketing',
    title: 'Welcome to Pelbu',
    sub: 'A local-first AI point of sale for Bhutan — counter to doorstep.',
  })
  await caption(page, { step: 1, title: 'The homepage', text: 'The value proposition: AI POS, GST-2026 accounting, and a marketplace.' }, 2000)
  await scrollTo(page, 620); await beat(page, 1600)
  await caption(page, { step: 2, title: 'One platform, four pillars', text: 'Distributor → wholesaler → retailer → shopper, all in one system.' }, 1600)
  await scrollTo(page, 0); await beat(page, 1000)

  // 2) The features hub.
  await caption(page, { step: 3, title: 'Explore the features', text: 'The top nav opens the feature hub and its deep-dive pages.' })
  await page.locator('header').getByRole('link', { name: 'Features' }).click()
  await expect(page).toHaveURL(/\/features/, { timeout: 15000 }); await beat(page, 2000)

  // 3) The vendor pitch → onboarding.
  await caption(page, { step: 4, title: 'Sell on Pelbu', text: 'Vendors start here to bring their shop online.' })
  await page.locator('header').getByRole('link', { name: 'Sell on Pelbu' }).click()
  await expect(page).toHaveURL(/\/sell/, { timeout: 15000 }); await beat(page, 2200)

  // 4) Done.
  await caption(page, { step: 5, title: 'Get started', text: 'Log in, or create a vendor account — Pelbu covers every tier of the trade.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
