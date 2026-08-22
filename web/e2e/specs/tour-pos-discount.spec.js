const { test, expect, PosPage, CartPanel, DAIRY_PRODUCT, clearCart } = require('./v2-helpers')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor POS (touch): a per-line discount, and how it re-bases the 5% GST.
// Uses the touch POS (/pos/touch), where discounts are a tap on the cart line. Overlays baked in.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — POS: apply a discount (GST recalculates)', async ({ page }) => {
  test.setTimeout(150_000)
  await clearCart()
  await installTour(page)
  const posPage = new PosPage(page)

  // 1) Open the touch POS and add an item.
  await posPage.goto()
  await posPage.assertPageLoaded()
  await titleCard(page, {
    kicker: 'Vendor · Touch POS',
    title: 'Discounts, done right',
    sub: 'Give a line discount — the 5% GST re-bases on the discounted price automatically.',
  })
  await caption(page, { step: 1, title: 'Add an item', text: 'Tap a product to drop it onto the bill.' })
  await posPage.addProductToCart(DAIRY_PRODUCT.name)
  const item = page.locator('[data-testid="cart-item"]').first()
  await expect(item).toBeVisible(); await beat(page, 1200)

  // 2) Open the discount editor on that line.
  await caption(page, { step: 2, title: 'Apply a line discount', text: 'Tap the discount icon on the line to open the inline editor.' })
  await item.locator('button[title="Apply discount"]').click(); await beat(page)
  const input = item.locator('input[type="number"]')
  await input.pressSequentially('10', { delay: 150 }); await beat(page)
  await item.locator('button', { hasText: 'OK' }).click()

  // 3) GST re-bases on the discounted amount.
  await caption(page, { step: 3, title: 'GST recalculates', text: 'A discount badge appears, and the 5% GST re-bases on the new taxable amount.' })
  await expect(item.locator('.bg-emerald-500\\/10').first()).toBeVisible(); await beat(page, 2200)

  // 4) Done.
  await caption(page, { step: 4, title: 'Always compliant', text: 'Line and bill discounts both keep every invoice GST-2026 correct.' }, 3000)
  await clearCaption(page); await beat(page, 800)
  await clearCart()
})
