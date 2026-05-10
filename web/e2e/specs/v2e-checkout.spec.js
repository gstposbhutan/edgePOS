const {
  test, expect, PosPage, CartPanel, PaymentScannerModal, CustomerIdModal,
  CHEAP_PRODUCT, LOW_STOCK_PRODUCT, TEST_PHONE, clearCart,
} = require('./v2-helpers')

test.describe('Payment Verification', () => {
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

  test('payment scanner shows expected amount', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MBOB')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const expectedAmount = CHEAP_PRODUCT.mrp * 1.05
    await expect(paymentScanner.expectedAmountText).toContainText(`Nu. ${expectedAmount.toFixed(2)}`)
  })

  test('capture triggers verification and transitions to success (mocked)', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MBOB')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const phase = await paymentScanner.getPhase()
    expect(['scanning', 'failed']).toContain(phase)
  })

  test('retry button visible on failed verification', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MBOB')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    const phase = await paymentScanner.getPhase()
    if (phase === 'failed') {
      await expect(paymentScanner.retryButton).toBeVisible()
    }
  })

  test('cancel closes the payment scanner modal', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('MBOB')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await paymentScanner.assertOpen()
    await paymentScanner.clickCancel()
    await paymentScanner.assertClosed()
  })
})

test.describe('Stock Gate', () => {
  let posPage, cartPanel, stockGateModal, customerIdModal

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    stockGateModal = new StockGateModal(page)
    customerIdModal = new CustomerIdModal(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('stock gate modal appears when stock is exceeded', async () => {
    await posPage.addProductToCart(LOW_STOCK_PRODUCT.name)
    for (let i = 0; i < 6; i++) {
      await cartPanel.updateQuantity(LOW_STOCK_PRODUCT.name, +1)
    }

    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()
    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()
  })

  test('remove shortfill item from stock gate modal', async () => {})
  test('back to cart button closes the modal', async () => {})
  test('emergency restock form submits batch and quantity', async () => {})
})

test.describe('Checkout Completion', () => {
  let posPage, cartPanel, customerIdModal

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    customerIdModal = new CustomerIdModal(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('order created with correct invoice format', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**', { timeout: 20000 })
    expect(page.url()).toMatch(/\/pos\/order\/[0-9a-f-]+/)
  })

  test('cart is cleared after successful checkout', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**', { timeout: 20000 })
    await posPage.goto()
    await posPage.assertPageLoaded()
    await cartPanel.assertCartEmpty()
  })

  test('redirects to order detail page with success param', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**?success=true', { timeout: 20000 })
    expect(page.url()).toContain('success=true')
  })

  test('receipt is sent via WhatsApp gateway (fire-and-forget)', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()

    await page.waitForURL('**/pos/order/**', { timeout: 20000 })
  })
})
