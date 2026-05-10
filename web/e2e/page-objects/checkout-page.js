const { expect } = require('@playwright/test')

/**
 * Page object for /shop/checkout — Consumer marketplace checkout page.
 *
 * Selectors derived from app/shop/checkout/page.jsx and components/shop/checkout-summary.jsx:
 *   - Header: "Checkout" h1, "{N} items" span, back arrow to /shop
 *   - CheckoutSummary component: per-vendor order sections with store name, items, subtotals;
 *     grand total section with Subtotal (ex-GST), GST (5%), Total
 *   - Delivery address: textarea with placeholder "Enter your full delivery address...",
 *     "Use my current location" / GPS button
 *   - Sticky footer: "Place Order" button, disabled when address is empty or loading
 *   - Error banner: red (tibetan) colored div with error text
 *   - Empty cart state: "Your cart is empty" with "Browse Products" link
 */

class CheckoutPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Header ───────────────────────────────────────────────────────
    this.heading = page.getByRole('heading', { name: /checkout/i })
    this.itemCountText = page.locator('span.text-sm.text-muted-foreground').filter({ hasText: /items/i })
    this.backButton = page.locator('a[href="/shop"] button')

    // ── Delivery address ─────────────────────────────────────────────
    this.addressTextarea = page.getByPlaceholder(/enter your full delivery address/i)
    this.useGpsButton = page.getByRole('button', { name: /use my current location/i })

    // ── Place Order button (sticky footer) ───────────────────────────
    this.placeOrderButton = page.getByRole('button', { name: /place order/i })

    // ── Error banner ─────────────────────────────────────────────────
    this.errorBanner = page.locator('div.bg-tibetan\\/10')

    // ── Totals section ───────────────────────────────────────────────
    this.subtotalText = page.locator('text=Subtotal (ex-GST)')
    this.gstText = page.locator('text=GST (5%)')
    this.totalText = page.locator('span.text-primary').filter({ hasText: /Nu\./ })

    // ── Store sections ───────────────────────────────────────────────
    this.storeSections = page.locator('div.border.border-border.rounded-xl')

    // ── Empty cart state ─────────────────────────────────────────────
    this.emptyCartMessage = page.getByText(/your cart is empty/i)
    this.browseProductsLink = page.getByRole('link', { name: /browse products/i })

    // ── Loading spinner ──────────────────────────────────────────────
    this.loadingSpinner = page.locator('svg.lucide-loader-2.animate-spin')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  /** Navigate to the Checkout page and wait for network idle. */
  async goto() {
    await this.page.goto('/shop/checkout')
    await this.page.waitForLoadState('networkidle')
  }

  /** Click the back arrow to return to /shop. */
  async clickBack() {
    await this.backButton.click()
    await this.page.waitForURL('**/shop')
  }

  // ── Delivery Address ────────────────────────────────────────────────

  /**
   * Fill the delivery address textarea.
   * @param {string} address
   */
  async fillAddress(address) {
    await this.addressTextarea.fill(address)
  }

  /** Click the "Use my current location" GPS button. */
  async clickUseGps() {
    await this.useGpsButton.click()
  }

  // ── Place Order ─────────────────────────────────────────────────────

  /** Click the "Place Order" button. */
  async placeOrder() {
    await this.placeOrderButton.click()
  }

  /**
   * Fill address and place order in one step.
   * @param {string} address
   */
  async fillAddressAndOrder(address) {
    await this.fillAddress(address)
    await this.placeOrder()
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get the number of store sections in the checkout summary.
   * @returns {Promise<number>}
   */
  async getStoreCount() {
    return this.storeSections.count()
  }

  /**
   * Get the grand total amount as displayed.
   * @returns {Promise<string>}
   */
  async getTotalText() {
    const el = this.page.locator('span.text-primary').filter({ hasText: /Nu\./ }).first()
    return (await el.textContent()).trim()
  }

  /**
   * Get the grand total amount as a number.
   * @returns {Promise<number>}
   */
  async getGrandTotal() {
    const text = await this.getTotalText()
    return parseFloat(text.replace('Nu.', '').trim())
  }

  /**
   * Get all store names displayed in the checkout summary.
   * @returns {Promise<string[]>}
   */
  async getStoreNames() {
    const nameEls = this.page.locator('span.text-sm.font-medium')
    const count = await nameEls.count()
    const names = []
    for (let i = 0; i < count; i++) {
      names.push((await nameEls.nth(i).textContent()).trim())
    }
    return names
  }

  /**
   * Get the item count from the header text (e.g. "3 items").
   * @returns {Promise<string>}
   */
  async getItemCountText() {
    return (await this.itemCountText.textContent()).trim()
  }

  /**
   * Check if the error banner is visible.
   * @returns {Promise<boolean>}
   */
  async hasError() {
    return this.errorBanner.isVisible({ timeout: 2000 }).catch(() => false)
  }

  /**
   * Get the error banner text.
   * @returns {Promise<string|null>}
   */
  async getErrorText() {
    if (!(await this.hasError())) return null
    return (await this.errorBanner.textContent()).trim()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the checkout page heading is visible. */
  async assertPageLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }

  /** Assert the empty cart state is shown. */
  async assertEmptyCart() {
    await expect(this.emptyCartMessage).toBeVisible()
  }

  /** Assert the "Place Order" button is disabled. */
  async assertPlaceOrderDisabled() {
    await expect(this.placeOrderButton).toBeDisabled()
  }

  /** Assert the "Place Order" button is enabled. */
  async assertPlaceOrderEnabled() {
    await expect(this.placeOrderButton).toBeEnabled()
  }

  /** Assert the error banner is visible. */
  async assertErrorVisible() {
    await expect(this.errorBanner).toBeVisible()
  }

  /**
   * Assert the error banner contains specific text.
   * @param {string} text
   */
  async assertErrorContains(text) {
    await expect(this.errorBanner).toContainText(text)
  }

  /**
   * Assert at least one store section is shown in the checkout summary.
   */
  async assertStoreSectionsVisible() {
    const count = await this.storeSections.count()
    expect(count).toBeGreaterThan(0)
  }

  /**
   * Assert the page redirected to the orders page after successful order.
   */
  async assertOrderPlaced() {
    await this.page.waitForURL('**/shop/orders**', { timeout: 15000 })
  }
}

module.exports = { CheckoutPage }
