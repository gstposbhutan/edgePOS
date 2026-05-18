const {
  test, expect, PosPage, CartPanel, CustomerIdModal,
  CHEAP_PRODUCT, IN_STOCK_PRODUCT, KHATA_ACCOUNT, TEST_PHONE, clearCart, resetStock, cleanupTestOrders,
} = require('./v2-helpers')

test.describe('Error Handling', () => {
  let posPage, cartPanel, customerIdModal

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    customerIdModal = new CustomerIdModal(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart(); await resetStock(); await cleanupTestOrders() })

  test.fixme('stock confirmation failure shows error message', async () => {})

  test('DB insert failure shows error banner', async ({ page }) => {
    await page.route('**/api/pos/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database connection failed' }),
        })
      } else {
        await route.continue()
      }
    })

    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    const errorBanner = page.locator('p.text-tibetan').first()
    await expect(errorBanner).toBeVisible({ timeout: 10000 })
  })

  test('credit sale without khata account shows error for CASHIER', async ({ page }) => {
    await posPage.addProductToCart(IN_STOCK_PRODUCT.name) // 35000
    await cartPanel.selectPaymentMethod('CREDIT')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(KHATA_ACCOUNT.debtor_phone)
    await customerIdModal.confirm()

    const errorBanner = page.locator('p.text-tibetan').first()
    await expect(errorBanner).toBeVisible({ timeout: 10000 })
  })
})
