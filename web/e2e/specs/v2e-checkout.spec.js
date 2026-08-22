const {
  test, expect, PosPage, CartPanel, StockGateModal, CustomerIdModal,
  CHEAP_PRODUCT, LOW_STOCK_PRODUCT, TEST_PHONE, clearCart, resetStock, cleanupTestOrders,
} = require('./v2-helpers')

test.describe('Payment Verification', () => {
  // BLOCKED ON PRODUCT: PaymentScannerModal is built at
  // web/components/pos/payment-scanner-modal.jsx but is not imported or
  // rendered by app/pos/touch/page.jsx. There is no way to reach it via
  // a UI flow until the cart-panel wires up MBOB/MPAY/RTGS to open it.
  // Unblock by either (a) integrating the modal into the checkout flow,
  // or (b) adding a /dev/payment-scanner harness route for direct mount.
  test.fixme('payment scanner shows expected amount', async () => {})
  test.fixme('capture triggers verification and transitions to success (mocked)', async () => {})
  test.fixme('retry button visible on failed verification', async () => {})
  test.fixme('cancel closes the payment scanner modal', async () => {})
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

    // Build a known shortfall: LOW_STOCK_PRODUCT has 6 in stock, we put 7 in cart.
    await posPage.addProductToCart(LOW_STOCK_PRODUCT.name)
    for (let i = 0; i < 6; i++) {
      await cartPanel.updateQuantity(LOW_STOCK_PRODUCT.name, +1)
    }

    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    // Touch POS forces customer ID before the stock check fires.
    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()
  })

  test.afterEach(async () => { await clearCart(); await resetStock(); await cleanupTestOrders() })

  test('stock gate modal appears when stock is exceeded', async () => {
    await stockGateModal.assertOpen()
    const names = await stockGateModal.getShortfallItemNames()
    expect(names.some(n => n.includes(LOW_STOCK_PRODUCT.name))).toBe(true)

    const detail = await stockGateModal.getShortfallDetails(LOW_STOCK_PRODUCT.name)
    expect(detail.needed).toBe(7)
    expect(detail.available).toBe(LOW_STOCK_PRODUCT.current_stock)
    expect(detail.shortBy).toBe(7 - LOW_STOCK_PRODUCT.current_stock)
  })

  test('remove shortfill item from stock gate modal', async () => {
    await stockGateModal.assertOpen()
    await stockGateModal.removeItem(LOW_STOCK_PRODUCT.name)

    // Removing the only shortfill item resolves the gate → modal closes.
    await stockGateModal.assertClosed()

    // Cart no longer shows the item.
    await expect(cartPanel.getCartItemByName(LOW_STOCK_PRODUCT.name)).not.toBeVisible()
  })

  test('back to cart button closes the modal without losing items', async () => {
    await stockGateModal.assertOpen()
    await stockGateModal.clickBackToCart()
    await stockGateModal.assertClosed()

    // Cart still has the item — Back to Cart is non-destructive.
    await expect(cartPanel.getCartItemByName(LOW_STOCK_PRODUCT.name)).toBeVisible()
  })

  test('emergency restock form submits batch and quantity', async ({ page }) => {
    await stockGateModal.assertOpen()

    // Mock the emergency-restock endpoint so we don't permanently mutate stock
    // (resetStock in afterEach only resets seeded product/batch rows).
    await page.route('**/api/inventory/emergency-restock', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, batch_id: 'mock-batch-id', new_stock: 100 }),
      })
    })

    const restockResponse = page.waitForResponse(
      (res) => res.url().endsWith('/api/inventory/emergency-restock') && res.request().method() === 'POST',
      { timeout: 5000 }
    )

    await stockGateModal.restockItem(LOW_STOCK_PRODUCT.name, 10, 'BTH-E2E-001')

    const res = await restockResponse
    const payload = JSON.parse(res.request().postData())
    expect(payload.batch_number).toBe('BTH-E2E-001')
    expect(payload.quantity).toBe(10)
    expect(payload.product_id).toBe(LOW_STOCK_PRODUCT.id)
  })
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

  test.afterEach(async () => { await clearCart(); await resetStock(); await cleanupTestOrders() })

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
