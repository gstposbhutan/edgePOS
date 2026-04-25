const { expect } = require('@playwright/test')

/**
 * Page object for the CartPanel component (right sidebar on POS page).
 * Covers cart items, quantity controls, discounts, price overrides,
 * payment method selection, totals, and checkout button.
 */
class CartPanel {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    this.cartBadge = page.locator('span.text-sm.font-medium:text("Cart")')

    // Empty cart state
    this.emptyCartMessage = page.locator('text=Cart is empty')

    // "N items" summary text next to the badge
    this.itemCountText = page.locator('text=/\\d+ items/')

    // ── Totals section ────────────────────────────────────────────────
    // These are inside the shrink-0 totals div
    this.subtotalLabel = page.locator('text=Subtotal (pre-discount)')
    this.discountLabel = page.locator('text=Discount')
    this.taxableLabel = page.locator('text=Taxable amount')
    this.gstLabel = page.locator('text=GST @ 5% (on taxable)')
    this.totalLabel = page.locator('span:text("Total")')

    // "Select Payment Method" or "Charge Nu. ..." button
    this.checkoutButton = page.locator('button', { hasText: /Select Payment Method|Charge Nu\.|Processing\.\.\./ })

    // Customer ID warning
    this.customerIdWarning = page.locator('text=Customer ID required before checkout')
  }

  // ── Cart item helpers ───────────────────────────────────────────────

  /**
   * Returns the locator for a cart item card containing the given name.
   * Each cart item lives in a div with class "p-2.5 rounded-lg border".
   */
  getCartItemByName(name) {
    return this.page.locator('.flex.flex-col.gap-1\\.5.p-2\\.5', { hasText: new RegExp(`^${escapeRegex(name)}`) }).first()
  }

  /**
   * Update the quantity of a cart item.
   * @param {string} itemName - display name of the cart item
   * @param {number} delta   - +1 to increment, -1 to decrement
   *
   * In the UI the minus button is first, then the quantity span, then the plus button.
   */
  async updateQuantity(itemName, delta) {
    const item = this.getCartItemByName(itemName)
    // The qty controls are inside a div with Minus, span, Plus buttons
    if (delta > 0) {
      await item.locator('button svg.lucide-plus').locator('..').click()
    } else {
      await item.locator('button svg.lucide-minus').locator('..').click()
    }
  }

  /**
   * Remove an item from cart by clicking the trash icon.
   * The Trash2 icon sits in a button at the top-right of the item card.
   */
  async removeItem(itemName) {
    const item = this.getCartItemByName(itemName)
    await item.locator('button svg.lucide-trash-2').locator('..').click()
  }

  /**
   * Apply a per-unit discount. Only visible to MANAGER/OWNER/ADMIN roles.
   * Clicks the Tag icon to open inline edit, fills the value, and confirms.
   */
  async applyDiscount(itemName, amount) {
    const item = this.getCartItemByName(itemName)
    // Click the Tag (discount) icon button
    await item.locator('button[title="Apply discount"]').click()
    // Fill the inline input
    const input = item.locator('input[type="number"]')
    await input.fill(String(amount))
    // Click OK to confirm
    await item.locator('button', { hasText: 'OK' }).click()
  }

  /**
   * Override the unit price. Only visible to MANAGER/OWNER/ADMIN roles.
   * Clicks the Pencil icon to open inline edit, fills the value, and confirms.
   */
  async overridePrice(itemName, price) {
    const item = this.getCartItemByName(itemName)
    // Click the Pencil (price override) icon button
    await item.locator('button[title="Override price"]').click()
    // Fill the inline input
    const input = item.locator('input[type="number"]')
    await input.fill(String(price))
    // Click OK to confirm
    await item.locator('button', { hasText: 'OK' }).click()
  }

  // ── Payment methods ─────────────────────────────────────────────────

  /**
   * Select a payment method by clicking the corresponding button.
   * Valid values: MBOB, MPAY, CASH, RTGS, CREDIT
   */
  async selectPaymentMethod(method) {
    const labels = { MBOB: 'mBoB', MPAY: 'mPay', CASH: 'Cash', RTGS: 'RTGS', CREDIT: 'Credit' }
    const label = labels[method] ?? method
    const btn = this.page.locator('.grid.grid-cols-3 button', { hasText: new RegExp(`^${escapeRegex(label)}$`, 'i') })
    await btn.click()
  }

  /**
   * Assert that a specific payment method button is visually selected.
   * When selected, the button has a colored background (no border-border).
   */
  async assertPaymentMethodSelected(method) {
    const labels = { MBOB: 'mBoB', MPAY: 'mPay', CASH: 'Cash', RTGS: 'RTGS', CREDIT: 'Credit' }
    const label = labels[method] ?? method
    const btn = this.page.locator('.grid.grid-cols-3 button', { hasText: new RegExp(`^${escapeRegex(label)}$`, 'i') })
    // Selected buttons have text-white class
    await expect(btn).toHaveClass(/text-white/)
  }

  /**
   * Returns all payment method button locators.
   */
  getPaymentMethods() {
    return this.page.locator('.grid.grid-cols-3 button')
  }

  // ── Totals ──────────────────────────────────────────────────────────

  /** Extract the numeric subtotal (pre-discount) value. */
  async getSubtotal() {
    const row = this.page.locator('div:has(> span:text("Subtotal (pre-discount)"))')
    const text = await row.locator('span').last().textContent()
    return parseNu(text)
  }

  /** Extract the GST total value. */
  async getGstTotal() {
    const row = this.page.locator('div:has(> span:text("GST @ 5% (on taxable)"))')
    const text = await row.locator('span').last().textContent()
    return parseNu(text)
  }

  /** Extract the grand total value (the bold "Total" line). */
  async getGrandTotal() {
    const row = this.page.locator('div.flex.justify-between.font-bold')
    const text = await row.locator('span').last().textContent()
    return parseNu(text)
  }

  // ── Cart state ──────────────────────────────────────────────────────

  /** Count of item cards currently in the cart. */
  async getCartItemCount() {
    return this.page.locator('.flex.flex-col.gap-1\\.5.p-2\\.5.rounded-lg').count()
  }

  /** Verify the empty cart message is visible. */
  async assertCartEmpty() {
    await expect(this.emptyCartMessage).toBeVisible()
  }

  /** Click the checkout / charge button. */
  async clickCheckout() {
    await this.checkoutButton.click()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Parse "Nu. 1234.56" into a float.
 */
function parseNu(text) {
  return parseFloat(text.replace('Nu.', '').replace('Nu', '').replace(/\s/g, '').trim())
}

/**
 * Escape a string for use inside a RegExp.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { CartPanel }
