/**
 * Page object for the Create Khata Account modal dialog.
 *
 * Selectors derived from components/pos/khata/create-account-modal.jsx:
 *   - DialogTitle "Create Khata Account"
 *   - Input fields: Customer Name, WhatsApp Number (type=tel), Credit Limit (type=number), Term days (type=number)
 *   - "Create Account" submit button
 *   - "Cancel" button
 *   - Error displayed in <p class="text-xs text-tibetan">
 */

const DIALOG_TITLE = 'text=Create Khata Account'
const NAME_INPUT = 'input[placeholder="e.g. Dorji Wangchuk"]'
const PHONE_INPUT = 'input[type="tel"][placeholder*="+975"]'
const LIMIT_INPUT = 'input[type="number"][min="0"][step="100"]'
const TERM_INPUT = 'input[type="number"][min="0"][step="1"]'
const SUBMIT_BTN = 'button:has-text("Create Account")'
const CANCEL_BTN = 'button:has-text("Cancel")'
const ERROR_TEXT = 'div[role="dialog"] p.text-tibetan'

class CreateAccountModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  /**
   * Fill the create account form fields.
   * @param {{ name?: string, phone?: string, limit?: string, termDays?: string }} data
   */
  async fillForm({ name, phone, limit, termDays } = {}) {
    if (name !== undefined) {
      await this.page.locator(NAME_INPUT).fill(name)
    }
    if (phone !== undefined) {
      await this.page.locator(PHONE_INPUT).fill(phone)
    }
    if (limit !== undefined) {
      // The modal has two number inputs; target the Credit Limit one specifically
      const limitLabel = this.page.locator('label', { hasText: 'Credit Limit (Nu.)' })
      const limitContainer = limitLabel.locator('..')
      await limitContainer.locator('input[type="number"]').fill(limit)
    }
    if (termDays !== undefined) {
      const termLabel = this.page.locator('label', { hasText: 'Term (days)' })
      const termContainer = termLabel.locator('..')
      await termContainer.locator('input[type="number"]').fill(termDays)
    }
  }

  async clickSubmit() {
    await this.page.locator(SUBMIT_BTN).click()
  }

  async clickCancel() {
    await this.page.locator(CANCEL_BTN).first().click()
  }

  /**
   * Assert the modal is open by checking for the dialog title.
   */
  async assertOpen() {
    await this.page.locator(DIALOG_TITLE).waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Get the error text displayed in the modal.
   * @returns {Promise<string|null>}
   */
  async getErrorText() {
    const errorEl = this.page.locator(ERROR_TEXT)
    const count = await errorEl.count()
    if (count === 0) return null
    return (await errorEl.last().textContent()).trim()
  }
}

module.exports = { CreateAccountModal }
