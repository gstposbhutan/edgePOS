const { expect } = require('@playwright/test')

/**
 * Page object for the CustomerIdModal dialog.
 * Captures customer WhatsApp number before checkout when no customer is identified.
 */
class CustomerIdModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Dialog root ──────────────────────────────────────────────────
    this.dialog = page.locator('[role="dialog"]')

    // Title
    this.title = this.dialog.locator('h2', { hasText: 'Identify Customer' })

    // Description
    this.description = this.dialog.locator('text=Every transaction requires a customer identity')

    // WhatsApp phone input
    this.phoneInput = this.dialog.locator('input[type="tel"][placeholder="+975 17 123 456"]')

    // Form label
    this.phoneLabel = this.dialog.locator('label', { hasText: 'WhatsApp Number' })

    // ── Buttons ───────────────────────────────────────────────────────
    this.cancelButton = this.dialog.locator('button', { hasText: 'Cancel' })
    this.confirmButton = this.dialog.locator('button', { hasText: 'Confirm Customer' })
    // Also covers the "Saving..." state
    this.savingButton = this.dialog.locator('button:has(svg.lucide-loader2)', { hasText: 'Saving...' })

    // Error text (validation message)
    this.errorText = this.dialog.locator('p.text-tibetan')
  }

  // ── Assertions ──────────────────────────────────────────────────────

  async assertOpen() {
    await expect(this.dialog).toBeVisible({ timeout: 10000 })
    await expect(this.title).toBeVisible()
    await expect(this.phoneInput).toBeVisible()
  }

  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Enter a phone number into the WhatsApp input field.
   * @param {string} phone - phone number in E.164 or local format
   */
  async enterPhone(phone) {
    await this.phoneInput.fill(phone)
  }

  /** Click the "Confirm Customer" submit button. */
  async confirm() {
    await this.confirmButton.click()
  }

  /** Click Cancel to dismiss the modal without identifying. */
  async cancel() {
    await this.cancelButton.click()
  }

  // ── State queries ───────────────────────────────────────────────────

  /**
   * Get the validation error text, if visible.
   * @returns {Promise<string|null>}
   */
  async getErrorText() {
    if (await this.errorText.isVisible()) {
      return this.errorText.textContent()
    }
    return null
  }
}

module.exports = { CustomerIdModal }
