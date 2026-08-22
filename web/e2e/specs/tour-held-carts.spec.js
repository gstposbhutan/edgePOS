const { test, expect } = require('./v2-helpers')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')
const { clearCart } = require('./v2-helpers')

// GUIDED TOUR — Vendor POS: hold a cart to serve another customer, then recall it. Overlays baked in.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

async function searchAdd(page, query) {
  await page.keyboard.press('F3')
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  await expect(modal).toBeVisible()
  await page.locator('[data-testid="keyboard-product-search-input"]').pressSequentially(query, { delay: 90 })
  await expect(modal.locator('table tbody tr').first()).toBeVisible()
  await modal.locator('table tbody tr').first().click()
  await expect(modal).not.toBeVisible()
}

test('TOUR — POS: hold a cart and recall it', async ({ page }) => {
  test.setTimeout(150_000)
  await clearCart()
  await installTour(page)

  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await page.locator('body').click({ position: { x: 4, y: 4 } })
  await titleCard(page, {
    kicker: 'Vendor · POS',
    title: 'Hold & recall carts',
    sub: 'Park a customer’s cart to serve someone in a hurry, then pick it back up.',
  })

  // 1) Ring up the first customer.
  await caption(page, { step: 1, title: 'Serve the first customer', text: 'Add their items to Cart 1 as usual.' })
  await searchAdd(page, 'Notebook')
  await expect(page.locator('table tbody tr')).toHaveCount(1); await beat(page, 1600)

  // 2) Hold that cart.
  await caption(page, { step: 2, title: 'Hold the cart', text: 'They forgot their wallet — hold Cart 1 and start a fresh one.' })
  await page.getByTitle(/Hold cart & start new/).click()
  await expect(page.getByRole('button', { name: /Cart 2/ })).toBeVisible({ timeout: 8000 }); await beat(page, 1600)

  // 3) Serve the next customer on the new cart.
  await caption(page, { step: 3, title: 'Serve the next customer', text: 'Ring up the person behind them on Cart 2 — no waiting.' })
  await searchAdd(page, 'Wai Wai')
  await expect(page.locator('table tbody tr')).toHaveCount(1); await beat(page, 1600)

  // 4) Recall the held cart.
  await caption(page, { step: 4, title: 'Recall the held cart', text: 'Tap Cart 1 to pick the first customer’s order right back up.' })
  await page.getByRole('button', { name: /Cart 1/ }).click()
  await expect(page.locator('table tbody tr').filter({ hasText: /Notebook/i })).toBeVisible({ timeout: 8000 }); await beat(page, 2200)

  // 5) Done.
  await caption(page, { step: 5, title: 'Nothing lost', text: 'Each held cart keeps its items, customer, and discounts until you check it out.' }, 3000)
  await clearCaption(page); await beat(page, 800)
  await clearCart()
})
