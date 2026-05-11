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

    // Camera toggle button — text reads "📷 Camera On" or "📷 Camera Off"
    this.cameraToggleButton = page.locator('button', { hasText: /Camera (On|Off)/ })

    // Product search input
    this.searchInput = page.getByPlaceholder('Search products by name or SKU...')

    // Product grid container (the grid inside the scrollable area)
    this.productGrid = page.locator('.grid.grid-cols-2.sm\\:grid-cols-3')

    // Empty state
    this.emptyProductsMessage = page.getByText('No products found')

    // Loading skeleton
    this.loadingSkeleton = page.locator('.animate-pulse')

    // Cart tab button — rendered as "Cart 1", "Cart 2", etc.
    this.cartHeader = page.locator('button', { hasText: /^Cart \d/ }).first()
  }

  // ── Navigation ──────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/pos/touch')
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
   * Click the product card to open its detail modal, then click "Add to Cart"
   * in the modal. The ProductDetailModal opens on card click and requires a
   * second click on the "Add to Cart" button to actually add the item.
   */
  async addProductToCart(name) {
    const card = this.getProductByName(name)
    await expect(card).toBeVisible()
    await card.click()

    // ProductDetailModal opens — click the "Add to Cart" button inside it
    const addToCartBtn = this.page.getByRole('button', { name: 'Add to Cart' })
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 })
    await addToCartBtn.click()

    // Wait for modal to close
    await expect(addToCartBtn).toBeHidden({ timeout: 3000 })

    // addItem is async but not awaited by the modal handler — wait for
    // the item to appear in the cart panel before returning.
    const cartItem = this.page.locator(
      '.flex.flex-col.gap-1\\.5.p-2\\.5.rounded-lg.border',
      { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }
    ).first()
    await expect(cartItem).toBeVisible({ timeout: 5000 })
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
    // Wait for loading skeletons to appear (search triggers them) then clear
    try {
      await this.loadingSkeleton.first().waitFor({ state: 'visible', timeout: 500 })
      await this.loadingSkeleton.first().waitFor({ state: 'hidden', timeout: 5000 })
    } catch {
      // No loading state — products are already rendered
    }
    return this.productGrid.locator('button').count()
  }

  /**
   * Extract the numeric price from a product card. The price appears as
   * "Nu. 35000.00" inside the card.
   */
  async getProductPrice(name) {
    const card = this.getProductByName(name)
    const priceText = await card.locator('span.font-bold').textContent()
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
