/**
 * Page object for /pos/khata/[id] — Khata account detail with transaction ledger.
 *
 * Selectors derived from app/pos/khata/[id]/page.jsx:
 *   - Summary cards: Outstanding, Credit Limit, Available
 *   - Action buttons: "Record Payment", "Set Limit", "Adjust Balance", "Freeze", "Unfreeze"
 *   - Transaction ledger with DEBIT/CREDIT/ADJUSTMENT badges
 *   - Status badge: ACTIVE, FROZEN, CLOSED
 */

const OUTSTANDING_CARD = 'text=Outstanding'
const CREDIT_LIMIT_CARD = 'text=Credit Limit'
const AVAILABLE_CARD = 'text=Available'
const RECORD_PAYMENT_BTN = 'button:has-text("Record Payment")'
const SET_LIMIT_BTN = 'button:has-text("Set Limit")'
const ADJUST_BALANCE_BTN = 'button:has-text("Adjust Balance")'
const FREEZE_BTN = 'button:has-text("Freeze")'
const UNFREEZE_BTN = 'button:has-text("Unfreeze")'
const TRANSACTION_LEDGER = 'text=Transaction Ledger'
const STATUS_BADGE = 'button.w-full.text-left ~ * [class*="text-\\[9px\\]"]'

class KhataDetailPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  async goto(accountId) {
    await this.page.goto(`/pos/khata/${accountId}`)
    await this.page.waitForSelector(OUTSTANDING_CARD, { timeout: 15000 })
  }

  /**
   * Get the outstanding balance text (e.g. "Nu. 500.00").
   * @returns {Promise<string>}
   */
  async getOutstandingBalance() {
    const card = this.page.locator('div').filter({ hasText: /^Outstanding/ }).first()
    const text = await card.locator('p.font-bold').textContent()
    return text.trim()
  }

  /**
   * Get the credit limit text.
   * @returns {Promise<string>}
   */
  async getCreditLimit() {
    const card = this.page.locator('div').filter({ hasText: /^Credit Limit/ }).first()
    const text = await card.locator('p.font-bold').textContent()
    return text.trim()
  }

  /**
   * Get the available balance text.
   * @returns {Promise<string>}
   */
  async getAvailableBalance() {
    const card = this.page.locator('div').filter({ hasText: /^Available/ }).first()
    const text = await card.locator('p.font-bold').textContent()
    return text.trim()
  }

  async clickRecordPayment() {
    await this.page.locator(RECORD_PAYMENT_BTN).click()
  }

  async clickAdjustBalance() {
    await this.page.locator(ADJUST_BALANCE_BTN).click()
  }

  async clickSetLimit() {
    await this.page.locator(SET_LIMIT_BTN).click()
  }

  async clickFreeze() {
    await this.page.locator(FREEZE_BTN).click()
  }

  async clickUnfreeze() {
    await this.page.locator(UNFREEZE_BTN).click()
  }

  /**
   * Get the number of transactions in the ledger.
   * Parses the "Transaction Ledger (N)" heading.
   * @returns {Promise<number>}
   */
  async getTransactionCount() {
    const ledgerLabel = this.page.locator('p').filter({ hasText: /Transaction Ledger/ }).first()
    const text = await ledgerLabel.textContent()
    const match = text?.match(/\((\d+)\)/)
    return match ? parseInt(match[1]) : 0
  }

  /**
   * Get all transaction types (DEBIT, CREDIT, ADJUSTMENT) currently visible.
   * @returns {Promise<string[]>}
   */
  async getTransactionTypes() {
    const badges = this.page.locator('[class*="text-\\[9px\\]"]').filter({ hasText: /^(DEBIT|CREDIT|ADJUSTMENT)$/ })
    const count = await badges.count()
    const types = []
    for (let i = 0; i < count; i++) {
      types.push((await badges.nth(i).textContent()).trim())
    }
    return types
  }

  /**
   * Assert the account status badge shows the expected value.
   * @param {'ACTIVE'|'FROZEN'|'CLOSED'} status
   */
  async assertStatus(status) {
    const badge = this.page.locator(`span:has-text("${status}")`).first()
    await badge.waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Assert the Freeze button is visible (implies ACTIVE status + OWNER role).
   */
  async assertFreezeButtonVisible() {
    await this.page.locator(FREEZE_BTN).waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Assert the Unfreeze button is visible (implies FROZEN status + OWNER role).
   */
  async assertUnfreezeButtonVisible() {
    await this.page.locator(UNFREEZE_BTN).waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Get the "Record Payment" button locator (for role checks).
   */
  getRecordPaymentButton() {
    return this.page.locator(RECORD_PAYMENT_BTN)
  }

  /**
   * Get the "Set Limit" button locator.
   */
  getSetLimitButton() {
    return this.page.locator(SET_LIMIT_BTN)
  }

  /**
   * Get the "Adjust Balance" button locator.
   */
  getAdjustBalanceButton() {
    return this.page.locator(ADJUST_BALANCE_BTN)
  }

  /**
   * Get a specific transaction row by type (DEBIT/CREDIT/ADJUSTMENT).
   * @param {string} type
   * @returns {import('@playwright/test').Locator}
   */
  getTransactionRow(type) {
    return this.page.locator('div.flex.items-center.gap-3').filter({ hasText: new RegExp(`\\b${type}\\b`) })
  }
}

module.exports = { KhataDetailPage }
