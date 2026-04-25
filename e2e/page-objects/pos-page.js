const { expect } = require('@playwright/test')

/**
 * Page object for the POS main page (/pos).
 * Covers the product grid, search, camera toggle, and page-level assertions.
 */
class PosPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    // Header
    this.storeNameText = page.locator('header p.font-serif')

    // Camera toggle button — text reads "Camera On" or "Camera Off"
    this.cameraToggleButton = page.locator('button', { hasText: /^Camera (On|Off)$/ })

    // Product search input
    this.searchInput = page.locator('input[placeholder="Search products by name or SKU..."]')

    // Product grid container (the grid inside the scrollable area)
    this.productGrid = page.locator('.grid.grid-cols-2.sm\\:grid-cols-3')

    // Empty state
    this.emptyProductsMessage = page.locator('text=No products found')

    // Loading skeleton
    this.loadingSkeleton = page.locator('.animate-pulse')

    // Cart panel (right side) — used only for verifying page layout loaded
    this.cartHeader = page.locator('text=Cart')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/pos')
  }

  // ── Assertions ──────────────────────────────────────────────────────

  async assertPageLoaded() {
    // The store name renders in the header serif paragraph
    await expect(this.storeNameText).toBeVisible({ timeout: 15000 })
    // The search input is always rendered once products panel loads
    await expect(this.searchInput).toBeVisible()
    // Cart label visible on the right
    await expect(this.cartHeader).toBeVisible()
  }

  // ── Product helpers ─────────────────────────────────────────────────

  /**
   * Returns the locator for a product card button matching the given name.
   * Product cards are <button> elements containing the product name text.
   */
  getProductByName(name) {
    return this.productGrid.locator('button', { hasText: name }).first()
  }

  /**
   * Click the product card to add it to cart. In the current UI the entire
   * card is clickable and fires onAddItem.
   */
  async addProductToCart(name) {
    const card = this.getProductByName(name)
    await expect(card).toBeVisible()
    await card.click()
  }

  /**
   * Type a query into the search input. The ProductPanel calls onSearch
   * on every onChange event.
   */
  async searchProducts(query) {
    await this.searchInput.fill(query)
  }

  /** Clear the search input. */
  async clearSearch() {
    await this.searchInput.clear()
  }

  /** Number of visible product card <button> elements in the grid. */
  async getProductCount() {
    return this.productGrid.locator('button').count()
  }

  /**
   * Extract the numeric price from a product card. The price appears as
   * "Nu. 35000.00" inside the card.
   */
  async getProductPrice(name) {
    const card = this.getProductByName(name)
    const priceText = await card.locator('span.text-primary.font-bold').textContent()
    return parseFloat(priceText.replace('Nu.', '').trim())
  }

  // ── Camera ──────────────────────────────────────────────────────────

  /** Click the camera on/off toggle button. */
  async toggleCamera() {
    await this.cameraToggleButton.click()
  }

  /** Assert the camera toggle shows "Camera On". */
  async assertCameraActive() {
    await expect(this.page.locator('button', { hasText: 'Camera On' })).toBeVisible()
  }

  /** Assert the camera toggle shows "Camera Off". */
  async assertCameraInactive() {
    await expect(this.page.locator('button', { hasText: 'Camera Off' })).toBeVisible()
  }
}

module.exports = { PosPage }
