const {
  test, expect, PosPage, CartPanel,
  CHEAP_PRODUCT, DAIRY_PRODUCT, clearCart,
} = require('./v2-helpers')

test.describe('Cart Management', () => {
  let posPage, cartPanel

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    cartPanel = new CartPanel(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('increment quantity with + button', async ({ page }) => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)

    // Find the + button directly within the cart item's qty control div
    const item = cartPanel.getCartItemByName(CHEAP_PRODUCT.name)
    const qtyDiv = item.locator('div.flex.items-center.gap-1')
    const plusBtn = qtyDiv.locator('button').nth(1)
    await plusBtn.click()

    // Wait for qty to update
    const qtySpan = qtyDiv.locator('span.w-6.text-center')
    await expect(qtySpan).toHaveText('2', { timeout: 5000 })
  })

  test('decrement quantity with - button', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    // Increment first to get qty=2
    await cartPanel.updateQuantity(CHEAP_PRODUCT.name, +1)
    const item = cartPanel.getCartItemByName(CHEAP_PRODUCT.name)
    await expect(item.locator('span.w-6.text-center')).toHaveText('2', { timeout: 5000 })

    // Now decrement back to 1
    await cartPanel.updateQuantity(CHEAP_PRODUCT.name, -1)
    await expect(item.locator('span.w-6.text-center')).toHaveText('1', { timeout: 5000 })
  })

  test('decrement to zero removes the item', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await cartPanel.updateQuantity(CHEAP_PRODUCT.name, -1)
    await cartPanel.assertCartEmpty()
  })

  test('remove item with trash button', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await posPage.addProductToCart(DAIRY_PRODUCT.name)
    await cartPanel.removeItem(CHEAP_PRODUCT.name)
    const count = await cartPanel.getCartItemCount()
    expect(count).toBe(1)
  })

  test('correct GST breakdown per item', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    const item = cartPanel.getCartItemByName(CHEAP_PRODUCT.name)
    const gstText = await item.locator('p.text-\\[10px\\]').textContent()
    expect(gstText).toContain('GST:')
    expect(gstText).toContain('Taxable:')
    expect(gstText).toContain('Nu. 3.00')
  })

  test('correct totals — subtotal, GST 5%, grand total', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    // Wait for first item to appear before adding second (cartId must be set)
    await expect(cartPanel.getCartItemByName(CHEAP_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    await posPage.addProductToCart(DAIRY_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(DAIRY_PRODUCT.name)).toBeVisible({ timeout: 5000 })

    const subtotal = await cartPanel.getSubtotal()
    const gstTotal = await cartPanel.getGstTotal()
    const grandTotal = await cartPanel.getGrandTotal()

    expect(subtotal).toBeCloseTo(145.00, 1)
    expect(gstTotal).toBeCloseTo(7.25, 1)
    expect(grandTotal).toBeCloseTo(152.25, 1)
  })

  test('checkout button is disabled without payment method', async () => {
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await expect(cartPanel.checkoutButton).toBeDisabled()
  })

  test('checkout button is disabled when cart is empty', async () => {
    await cartPanel.assertCartEmpty()
    await expect(cartPanel.checkoutButton).not.toBeVisible()
  })
})
