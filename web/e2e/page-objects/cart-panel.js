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
    this.customerIdWarning = page.locator('text=/Customer ID required before checkout/')
  }

  // ── Cart item helpers ───────────────────────────────────────────────

  /**
   * Returns the locator for a cart item card containing the given name.
   * Each cart item lives in a div with class "p-2.5 rounded-lg border".
   */
  getCartItemByName(name) {
    return this.page.locator('.flex.flex-col.gap-1\\.5.p-2\\.5.rounded-lg.border', { hasText: new RegExp(`^${escapeRegex(name)}`) }).first()
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
    const qtyDiv = item.locator('div.flex.items-center.gap-1')
    if (delta > 0) {
      await qtyDiv.locator('button').nth(1).click()
    } else {
      await qtyDiv.locator('button').first().click()
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
   * @param {string} itemName
   * @param {number} amount - discount value
   * @param {'FLAT'|'PERCENTAGE'} [type='FLAT'] - discount type
   */
  async applyDiscount(itemName, amount, type = 'FLAT') {
    const item = this.getCartItemByName(itemName)
    // Click the Tag (discount) icon button
    await item.locator('button[title="Apply discount"]').click()

    // Select discount type if percentage
    if (type === 'PERCENTAGE') {
      await item.locator('button', { hasText: /percent/i }).click()
    }

    // Fill the inline input
    const input = item.locator('input[type="number"]')
    await input.fill(String(amount))
    // Click OK to confirm
    await item.locator('button', { hasText: 'OK' }).click()
  }

  /**
   * Assert a percentage discount badge is visible on a cart item.
   */
  async assertPercentageDiscount(itemName, percent) {
    const item = this.getCartItemByName(itemName)
    const badge = item.locator('.bg-emerald-500\\/10')
    await expect(badge).toContainText(`−${percent}%`)
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
   * Valid values: ONLINE, CASH, CREDIT
   */
  async selectPaymentMethod(method) {
    const labels = { ONLINE: 'Online', CASH: 'Cash', CREDIT: 'Credit' }
    const label = labels[method] ?? method
    const btn = this.page.locator('.grid.grid-cols-3 button', { hasText: new RegExp(`^${escapeRegex(label)}$`, 'i') })
    await btn.click()
  }

  /**
   * Assert that a specific payment method button is visually selected.
   * When selected, the button has a colored background (no border-border).
   */
  async assertPaymentMethodSelected(method) {
    const labels = { ONLINE: 'Online', CASH: 'Cash', CREDIT: 'Credit' }
    const label = labels[method] ?? method
    const btn = this.page.locator('.grid.grid-cols-3 button', { hasText: new RegExp(`^${escapeRegex(label)}$`, 'i') })
    // Selected buttons have text-white class
    await expect(btn).toHaveClass(/text-white/)
  }

  /**
   * Fill the journal number input (visible when ONLINE is selected).
   */
  async fillJournalNumber(ref) {
    const input = this.page.locator('input[placeholder="Enter journal number"]')
    await input.fill(ref)
  }

  /**
   * Assert the journal number input is visible.
   */
  async assertJournalNumberVisible() {
    await expect(this.page.locator('input[placeholder="Enter journal number"]')).toBeVisible()
  }

  /**
   * Assert the count of payment method buttons shown.
   */
  async assertPaymentMethodCount(count) {
    const btns = this.page.locator('.grid.grid-cols-3 button')
    await expect(btns).toHaveCount(count)
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
    await this.emptyCartMessage.waitFor({ state: 'hidden', timeout: 5000 })
    return this.page.locator('.flex.flex-col.gap-1\\.5.p-2\\.5.rounded-lg.border').count()
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
