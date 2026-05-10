const { expect } = require('@playwright/test')

/**
 * Page object for the Orders list page (/pos/orders).
 *
 * Covers: order list, search, status filters, and navigation to order detail.
 */
class OrdersListPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    this.heading = page.locator('h1.font-serif:text("Orders")')
    this.searchInput = page.locator('input[placeholder="Search by order no. or WhatsApp..."]')
    this.refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first()
    this.emptyState = page.locator('text=No orders found')
    this.loadingSkeleton = page.locator('.animate-pulse')

    // Filter buttons row
    this.filterButtons = page.locator('div.flex.gap-1.overflow-x-auto button')

    // Individual filter button helper
    this.filterButton = (name) => page.locator(`div.flex.gap-1.overflow-x-auto button:has-text("${name}")`)

    // Order rows — each order is a <button> inside the list
    this.orderRows = page.locator('div.divide-y button')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/pos/orders')
    await this.page.waitForLoadState('networkidle')
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Type a search query into the search input.
   * Filters client-side by order_no or buyer_whatsapp.
   */
  async searchOrders(query) {
    await this.searchInput.fill(query)
  }

  /** Clear the search input. */
  async clearSearch() {
    await this.searchInput.clear()
  }

  /**
   * Click a filter button by name.
   * Valid: All, Whatsapp, Active, Completed, Cancelled, Refunds
   */
  async filterBy(filterName) {
    await this.filterButton(filterName).click()
  }

  /**
   * Click an order row to navigate to its detail page.
   * @param {string} orderNo - e.g. "SHOP-2026-001"
   */
  async clickOrder(orderNo) {
    const row = this.getOrderRow(orderNo)
    await row.click()
    await this.page.waitForURL('**/pos/orders/**')
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get the locator for a specific order row by order number.
   * Each row contains the order_no in a <p> with font-mono.
   */
  getOrderRow(orderNo) {
    return this.page.locator(`button:has(p.font-mono:text-is("${orderNo}"))`)
  }

  /** Count of visible order rows. */
  async getOrderCount() {
    return this.orderRows.count()
  }

  /**
   * Check if a specific order row shows the WhatsApp badge.
   * The WA badge is a span with text "WA" inside the order row.
   */
  async hasWhatsappBadge(orderNo) {
    const row = this.getOrderRow(orderNo)
    const badge = row.locator('span:has-text("WA")')
    return badge.isVisible()
  }

  /**
   * Get the status badge text for a specific order.
   */
  async getOrderStatus(orderNo) {
    const row = this.getOrderRow(orderNo)
    // Status badge is a <span> with rounded-full inside the row
    const badge = row.locator('span.inline-flex.rounded-full').last()
    return badge.textContent()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page heading is visible and page is loaded. */
  async assertPageLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
    await expect(this.searchInput).toBeVisible()
  }

  /** Assert at least one order row is visible. */
  async assertOrdersVisible() {
    const count = await this.orderRows.count()
    expect(count).toBeGreaterThan(0)
  }

  /** Assert the empty state message is shown. */
  async assertEmpty() {
    await expect(this.emptyState).toBeVisible()
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

module.exports = { OrdersListPage }
