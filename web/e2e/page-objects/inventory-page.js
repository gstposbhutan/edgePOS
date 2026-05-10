const { expect } = require('@playwright/test')

/**
 * Page object for the Inventory page (/pos/inventory).
 *
 * Covers: stock levels table, tabs (Stock Levels, Draft Purchases, Predictions,
 * Movement History), search, filters, alert banners, scan bill entry.
 */
class InventoryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    // Header
    this.heading = page.locator('h1.font-serif:text("Inventory")')
    this.refreshButton = page.locator('button[title="Refresh"]')

    // Alert banners
    this.outOfStockBanner = page.locator('div.border-tibetan\\/30:has-text("out of stock")')
    this.lowStockBanner = page.locator('div.border-amber-500\\/30:has-text("running low")')

    // Tabs
    this.tabButtons = page.locator('div.flex.gap-1 button, div.flex.gap-1.px-4.pt-3 button')

    // Stock tab specific
    this.searchInput = page.locator('input[placeholder="Search by name or SKU..."]')
    this.scanBillButton = page.locator('button:has(svg.lucide-camera)').first()
    this.filterButtons = page.locator('div.flex.gap-1 button')

    // Individual filter: ALL, LOW, OUT
    this.filterButton = (name) => page.locator(`div.flex.gap-1 button:has-text("${name}")`)

    // Stock table
    this.stockTable = page.locator('table.w-full')
    this.stockRows = page.locator('tbody tr')

    // Empty state
    this.emptyProductsMessage = page.locator('text=No products match this filter')

    // Loading skeleton
    this.loadingSkeleton = page.locator('.animate-pulse')

    // Movement history
    this.movementHistory = page.locator('div.space-y-2')

    // Prediction tab summary cards
    this.predictionSummaryCards = page.locator('div.grid.grid-cols-3')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/pos/inventory')
    await this.page.waitForLoadState('networkidle')
  }

  // ── Tab Navigation ──────────────────────────────────────────────────

  /**
   * Click a tab by its label.
   * Valid tabs: Stock Levels, Draft Purchases, Predictions, Movement History
   */
  async clickTab(tabName) {
    const tab = this.page.locator(`button:has-text("${tabName}")`).first()
    await tab.click()
  }

  // ── Search & Filter ─────────────────────────────────────────────────

  /** Type into the search input. */
  async searchProducts(query) {
    await this.searchInput.fill(query)
  }

  /** Clear the search input. */
  async clearSearch() {
    await this.searchInput.clear()
  }

  /**
   * Click a stock filter button.
   * Valid: All, Low (N), Out (N)
   */
  async filterBy(filterName) {
    await this.filterButton(filterName).click()
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /** Click the camera/scan bill button in the stock tab toolbar. */
  async clickScanBill() {
    await this.scanBillButton.click()
  }

  /**
   * Click the "Adjust" button for a specific product row.
   * Each row has an Adjust button next to the product.
   */
  async clickAdjustStock(productName) {
    const row = this.getStockRow(productName)
    await row.locator('button:has-text("Adjust")').click()
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get the stock row locator for a product by name.
   */
  getStockRow(productName) {
    return this.page.locator(`tr:has(td:text-is("${productName}"))`)
  }

  /** Count of visible stock rows. */
  async getProductCount() {
    return this.stockRows.count()
  }

  /**
   * Get the current stock level for a product.
   * @param {string} productName
   * @returns {Promise<number>}
   */
  async getStockLevel(productName) {
    const row = this.getStockRow(productName)
    const stockText = await row.locator('td:nth-child(3) span.font-bold').textContent()
    return parseInt(stockText, 10)
  }

  /**
   * Get the stock status badge text for a product.
   * @param {string} productName
   * @returns {Promise<string>}
   */
  async getStockStatus(productName) {
    const row = this.getStockRow(productName)
    return row.locator('td:nth-child(4) span').textContent()
  }

  /** Count of movement history entries. */
  async getMovementCount() {
    return this.movementHistory.locator('div.flex.items-center.gap-3').count()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page heading and search input are visible. */
  async assertPageLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 })
  }

  /** Assert the stock tab is active (default). */
  async assertStockTabActive() {
    const tab = this.page.locator('button:has-text("Stock Levels")')
    await expect(tab).toHaveClass(/border-primary/)
  }

  /**
   * Assert alert banners display the expected counts.
   * @param {number} outCount - expected out-of-stock count (0 means no banner)
   * @param {number} lowCount - expected low-stock count (0 means no banner)
   */
  async assertAlertBanners(outCount, lowCount) {
    if (outCount > 0) {
      await expect(this.outOfStockBanner).toBeVisible()
      await expect(this.outOfStockBanner).toContainText(`${outCount} product`)
    } else {
      await expect(this.outOfStockBanner).not.toBeVisible()
    }

    if (lowCount > 0) {
      await expect(this.lowStockBanner).toBeVisible()
      await expect(this.lowStockBanner).toContainText(`${lowCount} product`)
    } else {
      await expect(this.lowStockBanner).not.toBeVisible()
    }
  }

  /**
   * Assert a product is visible in the stock table.
   * @param {string} productName
   */
  async assertProductVisible(productName) {
    await expect(this.getStockRow(productName)).toBeVisible()
  }

  /**
   * Assert a product is NOT visible (filtered out).
   * @param {string} productName
   */
  async assertProductNotVisible(productName) {
    await expect(this.getStockRow(productName)).not.toBeVisible()
  }

  /** Assert the empty state message is shown. */
  async assertEmpty() {
    await expect(this.emptyProductsMessage).toBeVisible()
  }
}

module.exports = { InventoryPage }
