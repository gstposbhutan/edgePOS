const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Customer: browse the marketplace, add to cart, and check out with delivery.
// On-screen overlays (title card + per-step captions) are baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — Customer: browse, add to cart, checkout with delivery', async ({ page }) => {
  test.setTimeout(150_000)
  await installTour(page)

  // 1) Browse the shop.
  await page.goto('/shop'); await beat(page, 1200)
  const add = page.getByRole('button', { name: /add to cart/i })
  await expect(add.first()).toBeVisible()
  await titleCard(page, {
    kicker: 'Marketplace · Customer',
    title: 'Shop and check out',
    sub: 'Browse featured shops, fill a cart, and choose delivery.',
  })
  await caption(page, { step: 1, title: 'Browse the shop', text: 'Featured Pelbu shops and their products, ready to order.' }, 1900)

  // 2) Add an item and open the cart.
  await caption(page, { step: 2, title: 'Add to cart', text: 'Tap Add to cart, then open the cart to review the order.' })
  await add.first().click(); await beat(page)
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-shopping-bag') }).click(); await beat(page, 1600)

  // 3) Checkout — enter the delivery address (typed) and place the order.
  await caption(page, { step: 3, title: 'Checkout with delivery', text: 'Enter the delivery address, then place the order.' })
  await page.getByRole('button', { name: /checkout/i }).click()
  await page.waitForURL('**/shop/checkout**'); await beat(page)
  const addr = page.getByPlaceholder(/enter your full delivery address/i)
  await addr.click()
  await addr.pressSequentially('Changzamtog, Thimphu, near the swimming pool', { delay: 60 }); await beat(page)
  await page.getByRole('button', { name: /place order/i }).click()
  await page.waitForURL('**/shop/orders**'); await beat(page, 1800)

  // 4) Done.
  await caption(page, { step: 4, title: 'Order placed', text: 'Track it under My Orders — and show the rider your delivery OTP at the door.' }, 3200)
  await clearCaption(page); await beat(page, 800)
})
