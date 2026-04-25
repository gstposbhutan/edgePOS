/**
 * Page object for /shop/[slug] — Consumer-facing marketplace store page.
 *
 * Selectors derived from app/shop/[slug]/page.jsx:
 *   - Store name in h1 with class font-serif, text-[#D4AF37]
 *   - Store bio in <p class="text-gray-400 text-sm">
 *   - Category headings in h2 with uppercase tracking-widest
 *   - Product cards: product name in h3, price in <p>, "Order" link (wa.me href)
 *   - 404 state: h1 "Store not found"
 *   - Empty products: <p class="text-gray-500 text-sm">No products available yet.</p>
 */

const STORE_NAME = 'h1.text-3xl'
const STORE_BIO = 'p.text-gray-400.text-sm.max-w-md'
const CATEGORY_HEADING = 'h2.uppercase.tracking-widest'
const PRODUCT_CARD = 'article.group'
const PRODUCT_NAME = 'h3.text-lg'
const PRODUCT_PRICE = 'p.text-gray-400'
const ORDER_LINK = 'a:has-text("Order")'
const NOT_FOUND = 'h1:has-text("Store not found")'
const EMPTY_PRODUCTS = 'p.text-gray-500.text-sm:has-text("No products available")'

class ShopPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  /**
   * Navigate to a store page by slug.
   * @param {string} slug
   */
  async goto(slug) {
    await this.page.goto(`/shop/${slug}`)
  }

  /**
   * Assert the store name is visible and matches.
   * @param {string} name
   */
  async assertStoreName(name) {
    const heading = this.page.locator(STORE_NAME)
    await heading.waitFor({ state: 'visible', timeout: 10000 })
    const text = await heading.textContent()
    if (text?.trim() !== name) {
      throw new Error(`Expected store name "${name}", got "${text?.trim()}"`)
    }
  }

  /**
   * Assert that product cards are visible on the page.
   */
  async assertProductsVisible() {
    await this.page.locator(PRODUCT_CARD).first().waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Get all category names displayed on the page.
   * @returns {Promise<string[]>}
   */
  async getCategoryNames() {
    const headings = this.page.locator(CATEGORY_HEADING)
    const count = await headings.count()
    const names = []
    for (let i = 0; i < count; i++) {
      names.push((await headings.nth(i).textContent()).trim())
    }
    return names
  }

  /**
   * Get all product names displayed on the page.
   * @returns {Promise<string[]>}
   */
  async getProductNames() {
    const names = this.page.locator(PRODUCT_NAME)
    const count = await names.count()
    const result = []
    for (let i = 0; i < count; i++) {
      result.push((await names.nth(i).textContent()).trim())
    }
    return result
  }

  /**
   * Get the WhatsApp Order link href for a specific product.
   * @param {string} productName
   * @returns {Promise<string|null>}
   */
  async getWhatsAppLink(productName) {
    const card = this.page.locator(PRODUCT_CARD).filter({ hasText: productName })
    const link = card.locator(ORDER_LINK)
    return link.getAttribute('href')
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
    await this.page.locator(EMPTY_PRODUCTS).waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Get the store bio text.
   * @returns {Promise<string|null>}
   */
  async getStoreBio() {
    const bio = this.page.locator(STORE_BIO)
    const count = await bio.count()
    if (count === 0) return null
    return (await bio.textContent()).trim()
  }
}

module.exports = { ShopPage }
