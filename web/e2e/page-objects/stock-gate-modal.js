const { expect } = require('@playwright/test')

/**
 * Page object for the StockGateModal dialog.
 * Shown during checkout when one or more cart items have insufficient stock.
 * Each shortfall item shows a row with remove and restock options.
 */
class StockGateModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Dialog root ──────────────────────────────────────────────────
    this.dialog = page.locator('[role="dialog"]')

    // Title
    this.title = this.dialog.locator('h2', { hasText: 'Insufficient Stock' })

    // Description
    this.description = this.dialog.locator('text=The following items cannot be confirmed')

    // "Back to Cart" button at the bottom of the modal
    this.backToCartButton = this.dialog.locator('button', { hasText: 'Back to Cart' })

    // All shortfall rows (each wrapped in a border div)
    this.shortfallRows = this.dialog.locator('.border.border-border.rounded-lg.overflow-hidden')
  }

  // ── Assertions ──────────────────────────────────────────────────────

  async assertOpen() {
    await expect(this.dialog).toBeVisible({ timeout: 10000 })
    await expect(this.title).toBeVisible()
  }

  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Returns the names of all shortfall items displayed in the modal.
   * @returns {Promise<string[]>}
   */
  async getShortfallItemNames() {
    const count = await this.shortfallRows.count()
    const names = []
    for (let i = 0; i < count; i++) {
      const nameEl = this.shortfallRows.nth(i).locator('p.text-sm.font-medium')
      if (await nameEl.isVisible()) {
        names.push(await nameEl.textContent())
      }
    }
    return names
  }

  /**
   * Get the shortfall details for a specific item.
   * @param {string} name - item name
   * @returns {Promise<{ needed: number, available: number, shortBy: number }>}
   */
  async getShortfallDetails(name) {
    const row = this.getShortfallRow(name)
    const detailText = await row.locator('p.text-amber-600').textContent()
    const neededMatch = detailText.match(/Need (\d+)/)
    const availableMatch = detailText.match(/Available (\d+)/)
    const shortByMatch = detailText.match(/Short by (\d+)/)
    return {
      needed: neededMatch ? parseInt(neededMatch[1]) : 0,
      available: availableMatch ? parseInt(availableMatch[1]) : 0,
      shortBy: shortByMatch ? parseInt(shortByMatch[1]) : 0,
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Remove a shortfill item from cart by clicking the trash icon on its row.
   * @param {string} name - item name
   */
  async removeItem(name) {
    const row = this.getShortfallRow(name)
    await row.locator('button svg.lucide-trash-2').locator('..').click()
  }

  /**
   * Open the restock form for an item, fill in details, and submit.
   * @param {string} name    - item name
   * @param {string} qty     - quantity to restock
   * @param {string} batchNo - batch number (required)
   */
  async restockItem(name, qty, batchNo) {
    const row = this.getShortfallRow(name)

    // Click "Add Stock Now" to expand the restock form
    await row.locator('button', { hasText: 'Add Stock Now' }).click()

    // Fill batch number
    await row.locator('input[placeholder="e.g. BTH-2026-001"]').fill(batchNo)

    // Fill quantity
    await row.locator('input[type="number"][min="1"]').fill(String(qty))

    // Submit the restock form
    await row.locator('button', { hasText: 'Confirm Restock' }).click()
  }

  /** Click "Back to Cart" button. */
  async clickBackToCart() {
    await this.backToCartButton.click()
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Get a specific shortfall row by item name.
   * @param {string} name
   */
  getShortfallRow(name) {
    return this.shortfallRows.filter({ hasText: name }).first()
  }
}

module.exports = { StockGateModal }
