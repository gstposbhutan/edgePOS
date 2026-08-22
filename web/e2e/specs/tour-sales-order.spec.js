const { test, expect, PosPage, DAIRY_PRODUCT, clearCart } = require('./v2-helpers')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor: save a cart as a Sales Order or Quotation (no payment, no stock move) to
// fulfil into an invoice later. Runs on the touch POS. Overlays baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — Sales Order & Quotation: quote now, invoice later', async ({ page }) => {
  test.setTimeout(150_000)
  await clearCart()
  await installTour(page)
  const posPage = new PosPage(page)

  // 1) Build a cart.
  await posPage.goto()
  await posPage.assertPageLoaded()
  await titleCard(page, {
    kicker: 'Vendor · Sales Orders',
    title: 'Quote now, invoice later',
    sub: 'Save a cart as a sales order or a quotation — no payment, no stock move — and fulfil it later.',
  })
  await caption(page, { step: 1, title: 'Build the cart', text: 'Ring up the items the customer wants — just like a normal sale.' })
  await posPage.addProductToCart(DAIRY_PRODUCT.name)
  await expect(page.locator('[data-testid="cart-item"]').first()).toBeVisible(); await beat(page, 1200)

  // 2) Save as a draft document.
  await caption(page, { step: 2, title: 'Save as order / quotation', text: 'Instead of taking payment, save the cart as a draft document.' })
  await page.getByRole('button', { name: /save as order/i }).click()
  await expect(page.getByText('Save as draft')).toBeVisible({ timeout: 10000 }); await beat(page, 1400)

  // 3) Choose Sales Order vs Quotation.
  await caption(page, { step: 3, title: 'Order or quotation?', text: 'A sales order commits to fulfil; a quotation is a non-binding quote.' })
  await page.getByRole('button', { name: /^Sales Order$/i }).click()
  // Success = the draft is saved: the dialog closes and the cart clears (no payment, no stock move).
  await expect(page.getByText('Save as draft')).not.toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(0, { timeout: 15000 }); await beat(page, 2200)

  // 4) Done.
  await caption(page, { step: 4, title: 'Fulfil it later', text: 'Open the saved order any time and “Create Sales Invoice” to convert it into a real sale.' }, 3000)
  await clearCaption(page); await beat(page, 800)
  await clearCart()
})
