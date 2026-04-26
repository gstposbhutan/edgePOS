const { expect } = require('@playwright/test')

/**
 * Page object for the Vendor Restock Modal
 * Used by retailers to place wholesale orders from connected wholesalers
 */
class RestockModal {
  constructor(page) {
    this.page = page

    // Modal container
    this.modal = page.locator('dialog[open]')
    this.title = page.locator('[data-testid="restock-modal-title"]')

    // Step 1: Wholesaler list
    this.wholesalerList = page.locator('[data-testid="wholesaler-list"]')
    this.wholesalerCards = page.locator('[data-testid="wholesaler-card"]')
    this.wholesalerCard = (name) => page.locator(`[data-testid="wholesaler-${name}"]`)

    // Step 2: Catalog
    this.catalogSearch = page.locator('[data-testid="catalog-search"]')
    this.productGrid = page.locator('[data-testid="product-grid"]')
    this.productCard = (name) => page.locator(`[data-testid="product-${name}"]`)

    // Cart
    this.cartPanel = page.locator('[data-testid="restock-cart"]')
    this.cartItems = page.locator('[data-testid^="cart-item-"]')
    this.cartItem = (name) => page.locator(`[data-testid="cart-item-${name}"]`)
    this.subtotal = page.locator('[data-testid="restock-cart"] >> .text-muted-foreground >> nth=0')
    this.gstTotal = page.locator('[data-testid="restock-cart"] >> .text-muted-foreground >> nth=1')
    this.grandTotal = page.locator('[data-testid="restock-cart"] >> .text-primary')
    this.placeOrderBtn = page.locator('[data-testid="place-order-btn"]')

    // Close
    this.closeBtn = page.locator('[data-testid="close-restock-btn"]')
    this.backBtn = page.locator('[data-testid="back-to-wholesalers-btn"]')
  }

  /**
   * Assert that the restock modal is open
   */
  async assertOpen() {
    await expect(this.modal).toBeVisible()
    await expect(this.title).toContainText('Restock from Wholesaler')
  }

  /**
   * Assert that the restock modal is closed
   */
  async assertClosed() {
    await expect(this.modal).not.toBeVisible()
  }

  /**
   * Close the modal
   */
  async close() {
    await this.closeBtn.click()
    await this.assertClosed()
  }

  /**
   * Go back to wholesaler list from catalog
   */
  async goBack() {
    await this.backBtn.click()
    await expect(this.wholesalerList).toBeVisible()
  }

  /**
   * Select a wholesaler from the list
   */
  async selectWholesaler(name) {
    await this.wholesalerCard(name).click()
    await expect(this.productGrid).toBeVisible()
  }

  /**
   * Search for products in the catalog
   */
  async searchProducts(query) {
    await this.catalogSearch.fill(query)
  }

  /**
   * Add a product to the cart
   */
  async addProduct(name) {
    const card = this.productCard(name)
    await card.click()
  }

  /**
   * Update quantity of a cart item
   */
  async updateQuantity(name, delta) {
    const item = this.cartItem(name)
    const btn = delta > 0
      ? item.locator('[data-testid="qty-increase"]')
      : item.locator('[data-testid="qty-decrease"]')
    await btn.click()
  }

  /**
   * Remove an item from the cart
   */
  async removeItem(name) {
    const item = this.cartItem(name)
    await item.locator('[data-testid="remove-item"]').click()
  }

  /**
   * Get cart totals
   */
  async getTotals() {
    const subtotal = await this.subtotal.textContent()
    const gst = await this.gstTotal.textContent()
    const grand = await this.grandTotal.textContent()
    return { subtotal, gst, grand }
  }

  /**
   * Place the wholesale order
   */
  async placeOrder() {
    await this.placeOrderBtn.click()
  }

  /**
   * Assert success message is shown
   */
  async assertSuccess() {
    await expect(this.page.locator('[data-testid="restock-success"]')).toBeVisible()
  }
}

module.exports = { RestockModal }
