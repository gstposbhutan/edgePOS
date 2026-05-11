/**
 * Page object for /shop/store_[id] — Consumer-facing marketplace store page.
 *
 * Selectors derived from app/shop/store_[id]/page.jsx:
 *   - Store name in h1.text-xl.font-bold
 *   - "Store Not Found" in h1 with matching text
 *   - Product cards with h3.text-sm product names
 *   - Products loaded from entities/products tables
 */

const STORE_NAME = 'h1'
const PRODUCT_NAME = 'main h3'
const NOT_FOUND = 'h1:has-text("Store Not Found")'

class ShopPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  /**
   * Navigate to a store page by entity ID.
   * @param {string} storeId - Entity UUID
   */
  async goto(storeId) {
    await this.page.goto(`/shop/${storeId}`)
  }

  /**
   * Assert the store name is visible and matches.
   * @param {string} name
   */
  async assertStoreName(name) {
    // Wait for the store info banner to render (client-side hydration)
    const banner = this.page.locator('h1').first()
    await banner.waitFor({ state: 'visible', timeout: 15000 })
    const text = await banner.textContent()
    if (text?.trim() !== name) {
      throw new Error(`Expected store name "${name}", got "${text?.trim()}"`)
    }
  }

  /**
   * Get all category names displayed on the page.
   * @returns {Promise<string[]>}
   */
  async getCategoryNames() {
    // Current store page has no category grouping
    return []
  }

  /**
   * Get all product names displayed on the page.
   * @returns {Promise<string[]>}
   */
  async getProductNames() {
    const names = this.page.locator(PRODUCT_NAME)
    // Wait for at least one product to render (client-side hydration)
    await names.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    const count = await names.count()
    const result = []
    for (let i = 0; i < count; i++) {
      result.push((await names.nth(i).textContent()).trim())
    }
    return result
  }

  /**
   * Get the WhatsApp Order link href for a specific product.
   * Current implementation has no per-product WhatsApp links.
   * @param {string} productName
   * @returns {Promise<string|null>}
   */
  async getWhatsAppLink(productName) {
    return null
  }

  /**
   * Assert the 404 state is shown (store not found).
   */
  async assertNotFound() {
    await this.page.locator(NOT_FOUND).waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Assert the empty products state is shown.
   */
  async assertEmpty() {
    await this.page.locator('text=No products available').waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Get the store bio text.
   * Current implementation does not display a bio.
   * @returns {Promise<string|null>}
   */
  async getStoreBio() {
    return null
  }
}

module.exports = { ShopPage }
