const { test, expect } = require('@playwright/test')
const { clearCart } = require('./v2-helpers')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor POS: selling weighed goods (rice, sugar, veg). Overlays baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — POS: sell a weighed item', async ({ page }) => {
  test.setTimeout(150_000)
  await clearCart()
  await installTour(page)

  // 1) Open the register.
  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Vendor · POS',
    title: 'Sell by weight',
    sub: 'Rice, sugar, vegetables — priced per kilo, weighed at the counter.',
  })

  // 2) Find a weighed product.
  await caption(page, { step: 1, title: 'Find a weighed product', text: 'Press F3 and search — this item is priced per unit (per kg).' })
  await page.keyboard.press('F3')
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  await expect(modal).toBeVisible()
  await page.locator('[data-testid="keyboard-product-search-input"]').pressSequentially('11000 Bottle', { delay: 90 }); await beat(page)
  await expect(modal.locator('table tbody tr').first()).toBeVisible()
  await modal.locator('table tbody tr').first().click()

  // 3) The weigh modal opens.
  await caption(page, { step: 2, title: 'Enter the weight', text: 'A weigh modal opens — the cashier keys in the measured weight.' })
  await expect(page.getByText(/Weigh —/)).toBeVisible()
  await page.getByRole('spinbutton').pressSequentially('2', { delay: 120 }); await beat(page)

  // 4) The total is weight × per-unit rate.
  await caption(page, { step: 3, title: 'Weight × rate', text: 'The line total updates live as the weight × the per-kilo rate.' })
  await expect(page.getByText('Nu. 130.00', { exact: true })).toBeVisible(); await beat(page, 1600)
  await page.getByRole('button', { name: /^Add$/ }).click()

  // 5) The cart carries the fractional quantity.
  await caption(page, { step: 4, title: 'On the bill', text: 'The line carries the exact weighed quantity at the per-kg rate — GST 5% applies as usual.' }, 3000)
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  await clearCaption(page); await beat(page, 800)
  await clearCart()
})
