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
    // The office band's h1 — the screen is the Stock Register now (2026-08-24 reskin).
    this.heading = page.locator('h1:has-text("Stock Register")')
    this.refreshButton = page.locator('button[title="Refresh"]')

    // Alert banners — see app/pos/inventory/page.jsx
    this.outOfStockBanner = page.locator('[data-testid="out-of-stock-banner"]')
      .or(page.locator('div.border-tibetan\\/30:has-text("out of stock")'))
      .first()
    this.lowStockBanner = page.locator('[data-testid="low-stock-banner"]')
      .or(page.locator('div.border-amber-500\\/30:has-text("running low")'))
      .first()

    // Tabs — testid'd container holds all tab buttons
    this.tabButtons = page.locator('[data-testid="inventory-tabs"] button')

    // Stock tab specific
    this.searchInput = page.locator('input[placeholder="Search by name or SKU..."]')
    this.scanBillButton = page.locator('[data-testid="inventory-scan-btn"]')
      .or(page.locator('button:has(svg.lucide-camera)').first())
      .first()
    this.filterButtons = page.locator('[data-testid="inventory-filters"] button[data-testid^="inventory-filter-"]')

    // Individual filter — accepts a string id ("ALL"/"LOW"/"OUT") or a RegExp
    // for fuzzy text match (e.g. /Low/ matches "Low Stock").
    this.filterButton = (name) => {
      if (name instanceof RegExp) {
        return page.locator('[data-testid="inventory-filters"] button', { hasText: name }).first()
      }
      return page.locator(`[data-testid="inventory-filter-${name}"]`)
        .or(page.locator(`div.flex.gap-1 button:has-text("${name}")`))
        .first()
    }

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
    // The stock list is fetched async after entity_id resolves from the
    // session route. Wait for either a row or the empty state to render
    // so downstream reads don't see the still-empty initial table.
    await expect(this.stockRows.first().or(this.emptyProductsMessage)).toBeVisible()
    // The filter (ALL/LOW/OUT) state persists in-component between renders,
    // and a prior in-session test may have left it on LOW/OUT. Force ALL
    // so subsequent searches see the full catalog.
    const allBtn = this.page.locator('[data-testid="inventory-filter-ALL"]')
    if (await allBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      const isActive = (await allBtn.getAttribute('data-active')) === 'true'
      if (!isActive) await allBtn.click()
    }
  }

  // ── Tab Navigation ──────────────────────────────────────────────────

  /**
   * Click a tab by its label OR id.
   * Tab IDs (from app/pos/inventory/page.jsx TABS array): stock, draft, predictions, movements.
   * Labels: "Stock Levels", "Draft Purchases", "Predictions", "Movement History".
   */
  async clickTab(tabName) {
    // Tab IDs from app/pos/inventory/page.jsx TABS array.
    const idMap = {
      'Stock Levels':     'stock',
      'Batches':          'batches',
      'Draft Purchases':  'drafts',
      'Predictions':      'predictions',
      'Movement History': 'history',
    }
    const id = idMap[tabName] ?? tabName
    const byTestid = this.page.locator(`[data-testid="inventory-tab-${id}"]`)
    const byLabel = this.page.locator(`[data-testid="inventory-tabs"] button:has-text("${tabName}")`)
    const fallback = this.page.locator(`button:has-text("${tabName}")`).first()
    await byTestid.or(byLabel).or(fallback).first().click()
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
   * The inventory list is paginated/limited, so search first to make the
   * target row visible.
   */
  async clickAdjustStock(productName) {
    await this.ensureRowVisible(productName)
    const row = this.getStockRow(productName)
    await row.locator('button:has-text("Adjust")').click()
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Filter the table so the named product is visible, then return its row.
   */
  async ensureRowVisible(productName) {
    const row = this.getStockRow(productName)
    if (await row.first().isVisible({ timeout: 500 }).catch(() => false)) return
    // Search by the leading portion of the name (handles parenthetical suffixes)
    const query = productName.replace(/\s*\(.*?\)/g, '').trim()
    await this.searchProducts(query)
    const { expect } = require('@playwright/test')
    await expect(row.first()).toBeVisible()
  }

  /**
   * Get the stock row locator for a product by name.
   * The product cell holds <p>Name</p> alongside HSN text, so we match on
   * the paragraph rather than the td (td text-is would need exact whole-cell
   * match including the HSN suffix).
   */
  getStockRow(productName) {
    const safe = productName.replace(/"/g, '\\"')
    // The stock register puts the product name in its own cell; it used to be a <p> stacked over
    // the HSN code, which is now its own column.
    return this.page.locator(`tr:has(td:text-is("${safe}"))`)
      .or(this.page.locator(`tr:has(p:text-is("${safe}"))`))
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
    await this.ensureRowVisible(productName)
    const row = this.getStockRow(productName)
    // Read by testid rather than column position — the register gained HSN and Unit columns, and
    // positional selectors silently point at the wrong cell when that happens.
    const stockText = await row.locator('[data-testid="stock-qty"]')
      .or(row.locator('td:nth-child(3) span.font-bold')).first().textContent()
    return parseInt(stockText, 10)
  }

  /**
   * Get the stock status badge text for a product.
   * @param {string} productName
   * @returns {Promise<string>}
   */
  async getStockStatus(productName) {
    await this.ensureRowVisible(productName)
    const row = this.getStockRow(productName)
    return row.locator('[data-testid="stock-status"]')
      .or(row.locator('td:nth-child(4) span')).first().textContent()
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
  // Banner counts are asserted as "at least N" — the inventory may include
  // production products beyond the test seed, so the displayed counts can
  // exceed the seed minimums. The data-count attr exposed by inventory/page.jsx
  // is the source of truth.
  async assertAlertBanners(outCount, lowCount) {
    // `null` means "this test is not about that banner". Passing 0 asserts the banner is ABSENT,
    // which is a different and much stronger claim — and a false one on a database that holds
    // more than the seed, where both conditions genuinely exist at once.
    if (outCount === null) {
      // no assertion on the out-of-stock banner
    } else if (outCount > 0) {
      await expect(this.outOfStockBanner).toBeVisible()
      const c = parseInt(await this.outOfStockBanner.getAttribute('data-count') ?? '0', 10)
      expect(c, `out-of-stock banner expected >= ${outCount}, got ${c}`).toBeGreaterThanOrEqual(outCount)
    } else {
      await expect(this.outOfStockBanner).not.toBeVisible()
    }

    if (lowCount === null) {
      return
    }
    if (lowCount > 0) {
      await expect(this.lowStockBanner).toBeVisible()
      const c = parseInt(await this.lowStockBanner.getAttribute('data-count') ?? '0', 10)
      expect(c, `low-stock banner expected >= ${lowCount}, got ${c}`).toBeGreaterThanOrEqual(lowCount)
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

  /**
   * Assert that visible stock rows all show the given status badge text.
   *
   * The inventory table can render hundreds of rows (the LOW/OUT filters
   * commonly match 400+ products). Iterating every row with `.nth(i)` +
   * `.textContent()` exhausts the 60s test timeout before reaching the tail.
   * Instead we resolve the status badges of the rows actually present in the
   * DOM and check a bounded sample — sufficient to prove the filter applied.
   *
   * @param {string} statusText - e.g. 'Low Stock', 'Out of Stock'
   * @param {{ sample?: number }} [opts] - max rows to check (default 8)
   */
  async assertRowsHaveStatus(statusText, { sample = 8 } = {}) {
    // Read the status cell by testid — it used to be a badge <span> in column 4, and the register
    // moved it when HSN and Unit columns were added.
    const badges = this.page.locator('tbody tr [data-testid="stock-status"]')
    if (await badges.count() === 0) {
      // Older markup: a badge <span> in the fourth column.
      const legacy = this.page.locator('tbody tr td:nth-child(4) span')
      const legacyTotal = await legacy.count()
      expect(legacyTotal, `expected at least one row when filtering to ${statusText}`).toBeGreaterThan(0)
      for (let i = 0; i < Math.min(sample, legacyTotal); i++) {
        expect(await legacy.nth(i).textContent(), `row ${i} status`).toContain(statusText)
      }
      return
    }
    const total = await badges.count()
    expect(total, `expected at least one row when filtering to ${statusText}`).toBeGreaterThan(0)

    const limit = Math.min(sample, total)
    for (let i = 0; i < limit; i++) {
      const text = await badges.nth(i).textContent()
      expect(text, `row ${i} status`).toContain(statusText)
    }
  }
}

module.exports = { InventoryPage }
