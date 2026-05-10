/**
 * Page object for the Record Payment modal dialog.
 *
 * Selectors derived from components/pos/khata/record-payment-modal.jsx:
 *   - DialogTitle "Record Payment"
 *   - Amount input (type=number, min=0.01)
 *   - Payment method buttons: Cash, mBoB, mPay, RTGS, Bank
 *   - Reference No input (placeholder="e.g. RTGS ref number")
 *   - Notes input (placeholder="e.g. Partial payment for March")
 *   - Submit button shows "Record Nu. X.XX"
 *   - Cancel button
 *   - Error displayed in <p class="text-xs text-tibetan">
 */

const DIALOG_TITLE = 'text=Record Payment'
const AMOUNT_INPUT = 'input[type="number"][min="0.01"][step="0.01"]'
const REFERENCE_INPUT = 'input[placeholder="e.g. RTGS ref number"]'
const NOTES_INPUT = 'input[placeholder="e.g. Partial payment for March"]'
const SUBMIT_BTN = 'button[type="submit"]:has-text("Record")'
const CANCEL_BTN = 'div[role="dialog"] button:has-text("Cancel")'
const ERROR_TEXT = 'div[role="dialog"] p.text-tibetan'

/** Map of display labels to their internal IDs */
const METHOD_LABELS = {
  CASH: 'Cash',
  MBOB: 'mBoB',
  MPAY: 'mPay',
  RTGS: 'RTGS',
  BANK_TRANSFER: 'Bank',
}

class RecordPaymentModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  /**
   * Enter the payment amount.
   * @param {string|number} amount
   */
  async enterAmount(amount) {
    await this.page.locator(AMOUNT_INPUT).fill(String(amount))
  }

  /**
   * Select a payment method by clicking its button.
   * @param {'Cash'|'mBoB'|'mPay'|'RTGS'|'Bank'} method — display label
   */
  async selectMethod(method) {
    // Payment method buttons are inside a grid inside the dialog
    const dialog = this.page.locator('div[role="dialog"]')
    await dialog.locator('button[type="button"]', { hasText: method }).click()
  }

  /**
   * Enter a reference number.
   * @param {string} ref
   */
  async enterReference(ref) {
    await this.page.locator(REFERENCE_INPUT).fill(ref)
  }

  /**
   * Enter notes.
   * @param {string} notes
   */
  async enterNotes(notes) {
    await this.page.locator(NOTES_INPUT).fill(notes)
  }

  async clickSubmit() {
    await this.page.locator(SUBMIT_BTN).click()
  }

  async clickCancel() {
    await this.page.locator(CANCEL_BTN).click()
  }

  /**
   * Assert the modal is open.
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

module.exports = { RecordPaymentModal, METHOD_LABELS }
