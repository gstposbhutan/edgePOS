const {
  test, expect, PosPage, CartPanel, CustomerIdModal,
  CHEAP_PRODUCT, TEST_PHONE, clearCart,
} = require('./v2-helpers')

test.describe('Customer Identification', () => {
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

  test('customer ID modal is prompted before checkout', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()
    await customerIdModal.assertOpen()
  })

  test('accept a valid WhatsApp phone number', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone(TEST_PHONE)
    await customerIdModal.confirm()
    await customerIdModal.assertClosed()
  })

  test('show error for invalid phone number', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.enterPhone('abc')
    await customerIdModal.confirm()

    const error = await customerIdModal.getErrorText()
    expect(error).toBeTruthy()
    expect(error).toContain('valid WhatsApp number')
  })

  test('warning when no customer ID is present', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await expect(cartPanel.customerIdWarning).toBeVisible()
  })

  test('cancel the customer ID modal returns to cart', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.selectPaymentMethod('CASH')
    await cartPanel.clickCheckout()

    await customerIdModal.assertOpen()
    await customerIdModal.cancel()
    await customerIdModal.assertClosed()

    const count = await cartPanel.getCartItemCount()
    expect(count).toBe(1)
  })
})
