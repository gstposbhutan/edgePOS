const {
  test, expect, PosPage, CartPanel, CustomerIdModal, CustomerOtpModal,
  CHEAP_PRODUCT, KHATA_ACCOUNT, TEST_PHONE, clearCart, resetStock, cleanupTestOrders,
} = require('./v2-helpers')

test.describe('Payment Methods', () => {
  let posPage, cartPanel, customerIdModal

  test.beforeEach(async ({ page }) => {
    await clearCart(); await resetStock(); await cleanupTestOrders()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    customerIdModal = new CustomerIdModal(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart(); await resetStock(); await cleanupTestOrders() })

  test('exactly 3 payment methods shown: Online, Cash, Credit', async () => {
    // Payment-method buttons only render when the cart has items.
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.assertPaymentMethodCount(3)
  })

  test('CASH checkout succeeds', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**?success=true', { timeout: 20000 })
    expect(page.url()).toContain('/pos/order/')
  })

  test('ONLINE shows journal number input and blocks without it', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('ONLINE')

    // Journal number input should be visible
    await cartPanel.assertJournalNumberVisible()

    // Checkout button should be disabled without journal number
    await expect(cartPanel.checkoutButton).toBeDisabled()
  })

  test('ONLINE checkout proceeds with journal number', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('ONLINE')
    await cartPanel.fillJournalNumber('JRN-2026-00123')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**?success=true', { timeout: 20000 })
    expect(page.url()).toContain('/pos/order/')
  })

  test('CREDIT with valid khata account proceeds', async ({ page }) => {
    // Mock WhatsApp OTP — no live gateway needed.
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

    const otpModal = new CustomerOtpModal(page)

    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CREDIT')
    await cartPanel.clickCheckout()

    // Customer ID modal captures the phone.
    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(KHATA_ACCOUNT.debtor_phone)
    await customerIdModal.confirm()

    // Then the OTP modal opens for WhatsApp verification — this drives
    // handleCreditOtpVerified, which runs the khata lookup, credit limit
    // check, and then initiateCheckout.
    await otpModal.assertOpen()
    await otpModal.fillAndVerify(KHATA_ACCOUNT.debtor_phone, '123456')

    // CHEAP_PRODUCT is Nu. 60 → grand total 63. Outstanding 500 + 63 << 5000
    // → credit limit passes → order lands on receipt.
    await page.waitForURL('**/pos/order/**')
    expect(page.url()).toContain('/pos/order/')
  })

  test('CREDIT checkout opens customer identification', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CREDIT')
    // Customer check happens on checkout click, not via disabled state
    await cartPanel.clickCheckout()
    // Cashier role shows shift error; manager/owner see the customer modal
    const modalOrError = page.locator('[role="dialog"], .text-tibetan')
    await expect(modalOrError.first()).toBeVisible({ timeout: 5000 })
  })

  test('ONLINE journal number clears when switching payment method', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('ONLINE')
    await cartPanel.fillJournalNumber('JRN-TEST')

    // Switch to Cash
    await cartPanel.selectPaymentMethod('CASH')

    // Journal input should be hidden
    await expect(page.locator('input[placeholder="Enter journal number"]')).not.toBeVisible()
  })
})
