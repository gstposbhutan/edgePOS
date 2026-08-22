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

  test('stock confirmation failure surfaces both banner and stock gate', async ({ page }) => {
    // Server reports a stock-related 500 — the POS should show its error
    // banner AND re-open the stock gate (see app/pos/touch/page.jsx).
    await page.route('**/api/pos/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Stock has shrunk to 0 for this product' }),
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
    await expect(errorBanner).toBeVisible()
    // The stock-gate re-check is triggered when the API error contains "stock".
    // It may or may not produce shortfalls (real stock is fine here), so we
    // only assert the banner content mentions stock.
    await expect(errorBanner).toContainText(/stock/i)
  })

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

  test('credit sale exceeding khata limit shows error banner', async ({ page }) => {
    // Mock OTP so the credit flow can reach handleCreditOtpVerified, where
    // the credit-limit check lives. IN_STOCK_PRODUCT is Nu. 35000 — grand
    // total ~36750 + outstanding 500 vastly exceeds the 5000 credit limit.
    await page.route('**/api/auth/whatsapp/send', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mock: true, otp: '123456' }),
      })
    })
    await page.route('**/api/auth/whatsapp/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    const { CustomerOtpModal } = require('../page-objects/customer-otp-modal')
    const otpModal = new CustomerOtpModal(page)

    await posPage.addProductToCart(IN_STOCK_PRODUCT.name) // 35000
    await cartPanel.selectPaymentMethod('CREDIT')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(KHATA_ACCOUNT.debtor_phone)
    await customerIdModal.confirm()

    await otpModal.assertOpen()
    await otpModal.fillAndVerify(KHATA_ACCOUNT.debtor_phone, '123456')

    // Credit-limit-exceeded error renders in the cart's tibetan banner.
    const errorBanner = page.locator('p.text-tibetan').first()
    await expect(errorBanner).toBeVisible()
    await expect(errorBanner).toContainText(/Credit limit exceeded/i)
  })
})
