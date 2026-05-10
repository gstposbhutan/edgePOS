const {
  test, expect, PosPage, CartPanel,
  CHEAP_PRODUCT, DAIRY_PRODUCT, LOW_STOCK_PRODUCT, clearCart,
} = require('./v2-helpers')

test.describe('GST Calculation', () => {
  let posPage, cartPanel

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('5% GST on a single regular item', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(60.00, 1)
    expect(gstTotal).toBeCloseTo(3.00, 1)
    expect(grandTotal).toBeCloseTo(63.00, 1)
  })

  test('5% GST on multiple items with different prices', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(CHEAP_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    await posPage.addProductToCart(DAIRY_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(DAIRY_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    await posPage.addProductToCart(LOW_STOCK_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(LOW_STOCK_PRODUCT.name)).toBeVisible({ timeout: 5000 })

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    const expectedSubtotal = 60 + 85 + 120
    const expectedGst = expectedSubtotal * 0.05

    expect(subtotal).toBeCloseTo(expectedSubtotal, 1)
    expect(gstTotal).toBeCloseTo(expectedGst, 1)
    expect(grandTotal).toBeCloseTo(expectedSubtotal + expectedGst, 1)
  })

  test('5% GST on item with quantity > 1', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.updateQuantity(CHEAP_PRODUCT.name, +1)

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(120.00, 1)
    expect(gstTotal).toBeCloseTo(6.00, 1)
    expect(grandTotal).toBeCloseTo(126.00, 1)
  })
})
