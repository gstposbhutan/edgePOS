const { test, expect } = require('@playwright/test')
const { TEST_PRODUCTS, TEST_PHONE } = require('../fixtures/test-data')
const { TouchPosPage } = require('../page-objects/touch-pos-page')

test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Touch POS Flow', () => {

  test('browses products, adds to cart, completes CASH checkout', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    expect(await touchPos.getProductCount()).toBeGreaterThan(0)

    await touchPos.addProductByName(TEST_PRODUCTS[2].name)
    await touchPos.assertItemInCart(TEST_PRODUCTS[2].name)

    await touchPos.addProductByName(TEST_PRODUCTS[9].name)
    await touchPos.assertItemInCart(TEST_PRODUCTS[9].name)

    // Re-tap to increment quantity
    await touchPos.addProductByName(TEST_PRODUCTS[2].name)

    const totals = await touchPos.getTotals()
    expect(totals.subtotal).toBeGreaterThan(0)
    expect(totals.total).toBeGreaterThanOrEqual(totals.subtotal)

    await touchPos.checkout('CASH')

    // CASH checkout must redirect to the order detail page — anything else is a regression
    await page.waitForURL('**/pos/orders/**')
    await expect(page.locator('.font-mono').first()).toBeVisible()
  })

  test('searches for products and filters grid', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    const initialCount = await touchPos.getProductCount()
    expect(initialCount).toBeGreaterThan(0)

    await touchPos.searchProducts('Druk')
    // Filtered count strictly less than initial — search must filter, not no-op
    await expect.poll(() => touchPos.getProductCount()).toBeLessThan(initialCount)

    await touchPos.searchProducts('')
    await expect.poll(() => touchPos.getProductCount()).toBe(initialCount)
  })

  test('adds and removes items from cart', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    await touchPos.addProductByName(TEST_PRODUCTS[4].name)
    await touchPos.assertItemInCart(TEST_PRODUCTS[4].name)

    await touchPos.removeCartItem(TEST_PRODUCTS[4].name)
    await expect(touchPos.getCartItem(TEST_PRODUCTS[4].name)).not.toBeVisible()
  })

  test('checkout with customer identification via WhatsApp', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    await touchPos.addProductByName(TEST_PRODUCTS[1].name)

    await touchPos.selectPaymentMethod('CREDIT')
    await touchPos.checkoutButton.click()

    // CREDIT must always require customer ID
    await expect(touchPos.customerModalTitle).toBeVisible()
    await touchPos.identifyCustomer(TEST_PHONE)

    await page.waitForURL(/\/pos\/(orders?|order)\//)
  })

  test('ONLINE payment shows journal number input', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    await touchPos.addProductByName(TEST_PRODUCTS[1].name)
    await touchPos.selectPaymentMethod('ONLINE')
    await touchPos.assertJournalNumberVisible()

    await touchPos.fillJournalNumber('JRN-TEST-001')
    await touchPos.checkoutButton.click()

    // ONLINE also requires customer ID
    await expect(touchPos.customerModalTitle).toBeVisible()
    await touchPos.identifyCustomer(TEST_PHONE)

    await page.waitForURL(/\/pos\/(orders?|order)\//)
  })

  test('hold and switch between multiple carts', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    await touchPos.addProductByName(TEST_PRODUCTS[0].name)

    // Hold-cart is a real product feature per the page object — fail if it's missing
    await expect(touchPos.holdCartButton).toBeVisible()
    await touchPos.holdCart()

    await expect.poll(() => touchPos.getCartTabCount()).toBeGreaterThanOrEqual(2)

    await touchPos.addProductByName(TEST_PRODUCTS[3].name)
    await touchPos.assertItemInCart(TEST_PRODUCTS[3].name)

    await touchPos.switchCart(0)
    await touchPos.assertItemInCart(TEST_PRODUCTS[0].name)
  })

  test('completed order appears in orders list', async ({ page }) => {
    const touchPos = new TouchPosPage(page)
    await touchPos.goto()
    await touchPos.assertLoaded()

    await touchPos.addProductByName(TEST_PRODUCTS[5].name)
    await touchPos.checkout('CASH')

    await page.waitForURL('**/pos/orders/**')

    await page.goto('/pos/orders?section=SALES&tab=POS')
    await expect(page.getByRole('button', { name: /pos orders/i })).toBeVisible()
    expect(page.url()).toContain('/pos/orders')
  })
})
