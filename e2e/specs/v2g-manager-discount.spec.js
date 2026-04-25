const {
  test, expect, PosPage, CartPanel,
  CHEAP_PRODUCT, DAIRY_PRODUCT, clearCart,
} = require('./v2-helpers')

test.describe('Manager Discount and Price Override', () => {
  let posPage, cartPanel

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('discount applies and recalculates GST on taxable amount', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 10)

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(60.00, 1)
    expect(gstTotal).toBeCloseTo(2.50, 1)
    expect(grandTotal).toBeCloseTo(52.50, 1)
  })

  test('price override changes unit price and recalculates', async () => {
    await posPage.addProductToCart(DAIRY_PRODUCT.name)
    await cartPanel.overridePrice(DAIRY_PRODUCT.name, 75)

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(75.00, 1)
    expect(gstTotal).toBeCloseTo(3.75, 1)
    expect(grandTotal).toBeCloseTo(78.75, 1)
  })

  test('discount badge shows on cart item after applying', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 10)

    const item = cartPanel.getCartItemByName(CHEAP_PRODUCT.name)
    const discountBadge = item.locator('.bg-emerald-500\\/10')
    await expect(discountBadge).toBeVisible()
    await expect(discountBadge).toContainText('10.00')
  })
})
