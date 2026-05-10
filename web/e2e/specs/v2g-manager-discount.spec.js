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

  test('flat discount applies and recalculates GST on taxable amount', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 10)

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(60.00, 1)
    expect(gstTotal).toBeCloseTo(2.50, 1)
    expect(grandTotal).toBeCloseTo(52.50, 1)
  })

  test('percentage discount applies and recalculates correctly', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    // 10% discount on unit price of 60 → discount = 6.00 per unit
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 10, 'PERCENTAGE')

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(60.00, 1)
    expect(gstTotal).toBeCloseTo(2.70, 1) // GST on (60-6)*1 = 54 → 2.70
    expect(grandTotal).toBeCloseTo(56.70, 1)
  })

  test('flat discount badge shows on cart item', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 10)

    const item = cartPanel.getCartItemByName(CHEAP_PRODUCT.name)
    const discountBadge = item.locator('.bg-emerald-500\\/10')
    await expect(discountBadge).toBeVisible()
    await expect(discountBadge).toContainText('10.00')
  })

  test('percentage discount badge shows percentage symbol', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.applyDiscount(CHEAP_PRODUCT.name, 5, 'PERCENTAGE')

    await cartPanel.assertPercentageDiscount(CHEAP_PRODUCT.name, 5)
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
})
