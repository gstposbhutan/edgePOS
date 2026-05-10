const { expect } = require('@playwright/test')

/**
 * Page object for the Adjust Stock modal dialog.
 *
 * Covers: movement type selection, quantity entry, notes, confirm/cancel.
 * The modal is opened from the inventory page's stock table "Adjust" button.
 */
class AdjustStockModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    this.dialog = page.locator('[role="dialog"]')
    this.title = this.dialog.locator('h2:text("Adjust Stock")')
    this.description = this.dialog.locator('[id^="radix-"]:has-text("Current stock")')

    // Movement type buttons
    this.typeButtons = this.dialog.locator('div.grid.grid-cols-2 button')
    this.restockButton = this.dialog.locator('button:has-text("Restock")')
    this.lossButton = this.dialog.locator('button:has-text("Loss")')
    this.damagedButton = this.dialog.locator('button:has-text("Damaged")')
    this.transferButton = this.dialog.locator('button:has-text("Transfer")')

    // Form fields
    this.quantityInput = this.dialog.locator('input[type="number"][placeholder="0"]')
    this.notesInput = this.dialog.locator('input[placeholder="e.g. Delivery from Wholesaler A"]')

    // New stock level preview
    this.newStockPreview = this.dialog.locator('text=New stock level:')

    // Action buttons
    this.confirmButton = this.dialog.locator('button:has-text("Confirm Adjustment")')
    this.cancelButton = this.dialog.locator('button:has-text("Cancel")')

    // Error message
    this.errorText = this.dialog.locator('p.text-tibetan.text-xs')
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Select a movement type by clicking its button.
   * @param {'RESTOCK'|'LOSS'|'DAMAGED'|'TRANSFER'} type
   */
  async selectType(type) {
    const typeMap = {
      RESTOCK: 'Restock',
      LOSS: 'Loss',
      DAMAGED: 'Damaged',
      TRANSFER: 'Transfer',
    }
    const label = typeMap[type]
    await this.dialog.locator(`button:has-text("${label}")`).click()
  }

  /**
   * Enter a quantity value.
   * @param {number|string} qty
   */
  async enterQuantity(qty) {
    await this.quantityInput.fill(String(qty))
  }

  /**
   * Enter optional notes.
   * @param {string} notes
   */
  async enterNotes(notes) {
    await this.notesInput.fill(notes)
  }

  /** Click the "Confirm Adjustment" submit button. */
  async clickConfirm() {
    await this.confirmButton.click()
  }

  /** Click the "Cancel" button to close the modal. */
  async clickCancel() {
    await this.cancelButton.click()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the modal dialog is visible. */
  async assertOpen() {
    await expect(this.dialog).toBeVisible({ timeout: 5000 })
    await expect(this.title).toBeVisible()
  }

  /** Assert the modal is closed / not visible. */
  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  /**
   * Get error text if validation failed.
   * @returns {Promise<string|null>}
   */
  async getErrorText() {
    if (await this.errorText.isVisible({ timeout: 1000 }).catch(() => false)) {
      return this.errorText.textContent()
    }
    return null
  }

  /** Assert the error text matches. */
  async assertError(expectedText) {
    await expect(this.errorText).toHaveText(expectedText)
  }

  /**
   * Assert the new stock level preview shows a specific value.
   * @param {number} expectedStock
   */
  async assertNewStockPreview(expectedStock) {
    await expect(this.newStockPreview).toContainText(String(expectedStock))
  }
}

module.exports = { AdjustStockModal }
