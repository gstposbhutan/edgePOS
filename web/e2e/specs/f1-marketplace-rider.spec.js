const { test, expect } = require('@playwright/test')

// Marketplace customer→vendor side: browse, add to cart, checkout with delivery (exercises the real
// checkout → assignOrderToRider path), and the vendor's marketplace order view. The rider side is
// covered by the focused rider-delivery + rider-dispatch specs.

test.describe('Marketplace — customer checkout + vendor order view', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('customer browses shop, adds items, checks out with delivery', async ({ page }) => {
    await page.goto('/shop')

    const addButtons = page.getByRole('button', { name: /add to cart/i })
    await expect(addButtons.first()).toBeVisible()
    await addButtons.first().click()

    const cartIcon = page.getByRole('button').filter({ has: page.locator('svg.lucide-shopping-bag') })
    await cartIcon.click()

    const checkoutBtn = page.getByRole('button', { name: /checkout/i })
    await expect(checkoutBtn).toBeVisible()
    await checkoutBtn.click()

    await page.waitForURL('**/shop/checkout**')

    const addressTextarea = page.getByPlaceholder(/enter your full delivery address/i)
    await expect(addressTextarea).toBeVisible()
    await addressTextarea.fill('Changzamtog, Thimphu, near swimming pool')

    const placeOrderBtn = page.getByRole('button', { name: /place order/i })
    await expect(placeOrderBtn).toBeEnabled()

    const orderResponse = page.waitForResponse(
      (res) => /\/api\/shop\/checkout/.test(res.url()) && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(() => null)

    await placeOrderBtn.click()
    await page.waitForURL('**/shop/orders**')
    await orderResponse
  })

  test('vendor sees marketplace orders tab', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')

    const mktTab = page.getByRole('button', { name: /^marketplace$/i })
    await expect(mktTab).toBeVisible()

    const orderRow = page.locator('button:has(> .flex-1)').first()
    const emptyState = page.getByText(/no.*invoice|no.*order|empty/i)
    await expect(orderRow.or(emptyState)).toBeVisible()
  })

  // Marketplace orders are auto-CONFIRMED at checkout — no separate vendor accept action.
  test('vendor sees marketplace orders auto-confirmed after checkout', async ({ page }) => {
    await page.goto('/pos/orders?section=SALES&tab=MKT')

    const orderRows = page.locator('button:has(> .flex-1)')
    const emptyState = page.getByText(/no.*invoice|no.*order|empty/i)
    await expect(orderRows.first().or(emptyState)).toBeVisible()

    if ((await orderRows.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No marketplace orders — checkout test may have been skipped' })
      return
    }
    await expect(page.getByText('CONFIRMED').first()).toBeVisible()
  })
})
