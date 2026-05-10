const {
  test, expect, PosPage, CartPanel,
  IN_STOCK_PRODUCT, CHEAP_PRODUCT, DAIRY_PRODUCT, LOW_STOCK_PRODUCT,
  OUT_OF_STOCK, clearCart,
} = require('./v2-helpers')

test.describe('Product Selection', () => {
  let posPage

  test.beforeEach(async ({ page }) => {
    await clearCart()
    posPage = new PosPage(page)
    await posPage.goto()
    await posPage.assertPageLoaded()
  })

  test.afterEach(async () => { await clearCart() })

  test('product grid loads with items', async () => {
    const count = await posPage.getProductCount()
    expect(count).toBeGreaterThan(0)
  })

  test('search filters products by name', async () => {
    await posPage.searchProducts('Druk')
    const count = await posPage.getProductCount()
    expect(count).toBeGreaterThanOrEqual(1)

    const drukGen = posPage.getProductByName(IN_STOCK_PRODUCT.name)
    await expect(drukGen).toBeVisible()
  })

  test('search filters products by SKU', async () => {
    await posPage.searchProducts(CHEAP_PRODUCT.sku)
    const count = await posPage.getProductCount()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('search clears and shows all products again', async () => {
    const initialCount = await posPage.getProductCount()
    await posPage.searchProducts('XYZNONEXISTENT')
    const filteredCount = await posPage.getProductCount()
    expect(filteredCount).toBeLessThan(initialCount)

    await posPage.clearSearch()
    const restoredCount = await posPage.getProductCount()
    expect(restoredCount).toBe(initialCount)
  })

  test('out-of-stock products are disabled', async () => {
    const card = posPage.getProductByName(OUT_OF_STOCK.name)
    await expect(card).toBeDisabled()
  })

  test('add a product to cart by clicking its card', async ({ page }) => {
    const cartPanel = new CartPanel(page)
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    const itemCount = await cartPanel.getCartItemCount()
    expect(itemCount).toBe(1)
  })

  test('add multiple different products to cart', async ({ page }) => {
    const cartPanel = new CartPanel(page)
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(CHEAP_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    await posPage.addProductToCart(DAIRY_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(DAIRY_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    const itemCount = await cartPanel.getCartItemCount()
    expect(itemCount).toBe(2)
  })

  test('clicking same product twice increments quantity', async ({ page }) => {
    const cartPanel = new CartPanel(page)
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    await expect(cartPanel.getCartItemByName(CHEAP_PRODUCT.name)).toBeVisible({ timeout: 5000 })
    await posPage.addProductToCart(CHEAP_PRODUCT.name)
    const itemCount = await cartPanel.getCartItemCount()
    expect(itemCount).toBe(1)
  })
})
