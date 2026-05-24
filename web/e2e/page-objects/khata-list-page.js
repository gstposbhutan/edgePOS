/**
 * Page object for /pos/khata — Khata (Credit) account list.
 *
 * Selectors derived from app/pos/khata/page.jsx:
 *   - h1 "Khata (Credit)"
 *   - Search input with placeholder "Search by name or phone..."
 *   - "New" button (MANAGER/OWNER/ADMIN only)
 *   - Account rows rendered as <button> elements with debtor name, phone, outstanding, status
 */

const HEADING = 'h1:text-is("Khata (Credit)")'
const SEARCH_INPUT = 'input[placeholder="Search by name or phone..."]'
const NEW_BUTTON = 'button:has-text("New")'
const ACCOUNT_ROW = '[data-testid="khata-account-row"]'
const EMPTY_STATE = 'text=No khata accounts yet'
const EMPTY_SEARCH = 'text=No accounts match your search'
const LOADING_SPINNER = '.animate-spin'

class KhataListPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/pos/khata')
    await this.page.waitForSelector(HEADING, { timeout: 15000 })
  }

  async searchAccounts(query) {
    const input = this.page.locator(SEARCH_INPUT)
    await input.fill(query)
    const { expect } = require('@playwright/test')
    await expect(input).toHaveValue(query)
    await expect(
      this.page.locator(ACCOUNT_ROW).first().or(this.page.locator(EMPTY_SEARCH))
    ).toBeVisible()
  }

  async clickCreateAccount() {
    await this.page.locator(NEW_BUTTON).click()
  }

  /**
   * Click the account row matching the given debtor name.
   * @param {string} name
   */
  async clickAccount(name) {
    // Account rows are <button> elements containing the debtor name
    const row = this.getAccountRow(name)
    await row.click()
    await this.page.waitForURL('**/pos/khata/**', { timeout: 10000 })
  }

  /**
   * Count the visible account rows.
   * @returns {Promise<number>}
   */
  async getAccountCount() {
    return this.page.locator(ACCOUNT_ROW).count()
  }

  /**
   * Assert that an account with the given debtor name is visible.
   * @param {string} name
   */
  async assertAccountVisible(name) {
    const row = this.getAccountRow(name)
    await row.waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Assert the list shows the empty state (no accounts).
   */
  async assertEmpty() {
    await this.page.locator(EMPTY_STATE).waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Assert the search returned no results.
   */
  async assertSearchEmpty() {
    await this.page.locator(EMPTY_SEARCH).waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Get the account row locator by debtor name.
   * The row text includes the name in a span with class "font-medium".
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  getAccountRow(name) {
    const safe = name.replace(/"/g, '\\"')
    return this.page.locator(`${ACCOUNT_ROW}[data-account-name="${safe}"]`)
      .or(this.page.locator(ACCOUNT_ROW).filter({ hasText: name }))
      .first()
  }

  /**
   * Get the "New" button locator (for role-based visibility checks).
   */
  getNewButton() {
    return this.page.locator(NEW_BUTTON)
  }

  /**
   * Get the heading locator.
   */
  getHeading() {
    return this.page.locator(HEADING)
  }
}

module.exports = { KhataListPage }
