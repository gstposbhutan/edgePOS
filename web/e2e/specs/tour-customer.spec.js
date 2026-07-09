const { test, expect } = require('@playwright/test')

// GUIDED TOUR — Customer: browse the marketplace, add to cart, and check out with delivery.
// Slow-paced (tour project slowMo + typed address + pauses).
test.use({ storageState: 'e2e/storage/manager-auth.json' })

const beat = (page, ms = 1400) => page.waitForTimeout(ms)

test('TOUR — Customer: browse, add to cart, checkout with delivery', async ({ page }) => {
  test.setTimeout(120_000)

  // 1) Browse the shop.
  await page.goto('/shop'); await beat(page, 2000)
  const add = page.getByRole('button', { name: /add to cart/i })
  await expect(add.first()).toBeVisible()

  // 2) Add an item and open the cart.
  await add.first().click(); await beat(page)
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-shopping-bag') }).click(); await beat(page, 1600)

  // 3) Checkout — enter the delivery address (typed) and place the order.
  await page.getByRole('button', { name: /checkout/i }).click()
  await page.waitForURL('**/shop/checkout**'); await beat(page)
  const addr = page.getByPlaceholder(/enter your full delivery address/i)
  await addr.click()
  await addr.pressSequentially('Changzamtog, Thimphu, near the swimming pool', { delay: 60 }); await beat(page)
  await page.getByRole('button', { name: /place order/i }).click()
  await page.waitForURL('**/shop/orders**'); await beat(page, 2600)
})
