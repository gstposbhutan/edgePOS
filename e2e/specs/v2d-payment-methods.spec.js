const {
  test, expect, PosPage, CartPanel, PaymentScannerModal, CustomerIdModal,
  CHEAP_PRODUCT, KHATA_ACCOUNT, TEST_PHONE, clearCart,
} = require('./v2-helpers')

test.describe('Payment Methods', () => {
  let posPage, cartPanel, paymentScanner, customerIdModal

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    paymentScanner = new PaymentScannerModal(page)
    customerIdModal = new CustomerIdModal(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

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

  test('MBOB triggers payment scanner modal', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MBOB')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const label = await paymentScanner.getPaymentMethodLabel()
    expect(label).toBe('mBoB')
  })

  test('MPAY triggers payment scanner modal', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MPAY')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const label = await paymentScanner.getPaymentMethodLabel()
    expect(label).toBe('mPay')
  })

  test('RTGS triggers payment scanner modal', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('RTGS')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const label = await paymentScanner.getPaymentMethodLabel()
    expect(label).toBe('RTGS Bank Transfer')
  })

  test('CREDIT with valid khata account proceeds', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(KHATA_ACCOUNT.debtor_phone)
    await customerIdModal.confirm()

    await cartPanel.selectPaymentMethod('CREDIT')
    await cartPanel.clickCheckout()

    const outstandingText = page.locator('text=Outstanding')
    await expect(outstandingText).toBeVisible()
  })

  test('blocks CREDIT without customer ID', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    const creditBtn = page.locator('.grid.grid-cols-3 button', { hasText: /^Credit$/i })
    await expect(creditBtn).toBeDisabled()
  })

  test('blocks CREDIT without khata account for CASHIER', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone('+97517999999')
    await customerIdModal.confirm()

    await cartPanel.selectPaymentMethod('CREDIT')
    await cartPanel.clickCheckout()

    const errorText = page.locator('.bg-tibetan\\/10 p')
    await expect(errorText).toBeVisible({ timeout: 5000 })
  })
})
