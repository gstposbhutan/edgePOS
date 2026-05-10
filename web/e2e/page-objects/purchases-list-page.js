const { expect } = require('@playwright/test')

/**
 * Page object for /pos/purchases — Purchases list with PO / Invoice tabs.
 *
 * Selectors derived from app/pos/purchases/page.jsx:
 *   - Header: h1.font-serif "Purchases", refresh button (RefreshCw icon), "New PO" button
 *   - Tabs: "Purchase Orders" / "Purchase Invoices" <button>s with FileText/Receipt icons
 *   - List rows: <button> elements inside div.divide-y, each containing order_no (font-mono),
 *     status badge, supplier name, date, total
 *   - Each row navigates to /pos/purchases/[id]
 *   - Empty state: "No purchase orders yet" / "No invoices yet"
 *   - Loading skeletons: .animate-pulse
 */

class PurchasesListPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    // Header
    this.heading = page.locator('h1.font-serif:text("Purchases")')
    this.refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first()
    this.newPoButton = page.getByRole('button', { name: /new po/i })

    // Tabs
    this.poTab = page.getByRole('button', { name: /purchase orders/i })
    this.invoiceTab = page.getByRole('button', { name: /purchase invoices/i })

    // List rows — each purchase is a <button> inside div.divide-y
    this.orderRows = page.locator('div.divide-y button')

    // Empty state
    this.emptyState = page.locator('text=No purchase orders yet, text=No invoices yet')

    // Loading skeletons
    this.loadingSkeleton = page.locator('.animate-pulse')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  /** Navigate to the Purchases list page and wait for network idle. */
  async goto() {
    await this.page.goto('/pos/purchases')
    await this.page.waitForLoadState('networkidle')
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /** Click the "New PO" button to navigate to /pos/purchases/new. */
  async clickNewPo() {
    await this.newPoButton.click()
    await this.page.waitForURL('**/pos/purchases/new')
  }

  /** Click the "Purchase Orders" tab. */
  async clickPoTab() {
    await this.poTab.click()
  }

  /** Click the "Purchase Invoices" tab. */
  async clickInvoiceTab() {
    await this.invoiceTab.click()
  }

  /** Click the refresh button to reload purchases. */
  async clickRefresh() {
    await this.refreshButton.click()
  }

  /**
   * Click a specific order row to navigate to its detail page.
   * @param {string} orderNo - e.g. "PO-2026-001"
   */
  async clickOrder(orderNo) {
    const row = this.getOrderRow(orderNo)
    await row.click()
    await this.page.waitForURL('**/pos/purchases/**')
  }

  /**
   * Click an order row by its index in the list.
   * @param {number} index - 0-based index
   */
  async clickOrderRow(index) {
    await this.orderRows.nth(index).click()
    await this.page.waitForURL('**/pos/purchases/**')
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get the locator for a specific order row by order number.
   * Each row contains the order_no in a <p> with font-mono.
   * @param {string} orderNo
   * @returns {import('@playwright/test').Locator}
   */
  getOrderRow(orderNo) {
    return this.page.locator(`button:has(p.font-mono:text-is("${orderNo}"))`)
  }

  /** Count of visible order rows. */
  async getRowCount() {
    return this.orderRows.count()
  }

  /**
   * Get the status badge text for a specific order.
   * @param {string} orderNo
   * @returns {Promise<string>}
   */
  async getOrderStatus(orderNo) {
    const row = this.getOrderRow(orderNo)
    const badge = row.locator('span.rounded-full').first()
    return (await badge.textContent()).trim()
  }

  /**
   * Get the total amount text for a specific order row.
   * @param {string} orderNo
   * @returns {Promise<string>}
   */
  async getOrderTotal(orderNo) {
    const row = this.getOrderRow(orderNo)
    const totalEl = row.locator('p.font-semibold.text-primary')
    return (await totalEl.textContent()).trim()
  }

  /**
   * Get the supplier name text for a specific order row.
   * @param {string} orderNo
   * @returns {Promise<string>}
   */
  async getSupplierName(orderNo) {
    const row = this.getOrderRow(orderNo)
    const supplierEl = row.locator('span.truncate')
    return (await supplierEl.textContent()).trim()
  }

  /**
   * Get all order numbers currently visible in the list.
   * @returns {Promise<string[]>}
   */
  async getOrderNumbers() {
    const orderNoEls = this.page.locator('div.divide-y button p.font-mono.font-medium')
    const count = await orderNoEls.count()
    const numbers = []
    for (let i = 0; i < count; i++) {
      numbers.push((await orderNoEls.nth(i).textContent()).trim())
    }
    return numbers
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page heading is visible and page is loaded. */
  async assertPageLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }

  /** Assert at least one order row is visible. */
  async assertOrdersVisible() {
    const count = await this.orderRows.count()
    expect(count).toBeGreaterThan(0)
  }

  /** Assert the empty state message is shown. */
  async assertEmpty() {
    const emptyPo = this.page.locator('text=No purchase orders yet')
    const emptyInv = this.page.locator('text=No invoices yet')
    await expect(emptyPo.or(emptyInv)).toBeVisible()
  }

  /**
   * Assert a specific order is visible in the list.
   * @param {string} orderNo
   */
  async assertOrderVisible(orderNo) {
    await expect(this.getOrderRow(orderNo)).toBeVisible()
  }

  /**
   * Assert a specific order is NOT visible in the list.
   * @param {string} orderNo
   */
  async assertOrderNotVisible(orderNo) {
    await expect(this.getOrderRow(orderNo)).not.toBeVisible()
  }
}

module.exports = { PurchasesListPage }
