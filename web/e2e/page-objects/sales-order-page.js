const { expect } = require('@playwright/test')

/**
 * Page object for /salesorder — Sales Order creation page.
 *
 * Selectors derived from app/salesorder/page.jsx:
 *   - Left panel: customer phone input (type="tel", placeholder="+975 17 123 456 *"),
 *     customer name input (placeholder="Customer name"), delivery address input
 *     (placeholder="Delivery address"), "Use GPS" button, "Search products..." button
 *   - Right panel: product table with #, Product, Qty, Unit, Total columns;
 *     item rows with +/- buttons, trash icon; empty state with "Press any key..."
 *   - Bottom totals: Subtotal, GST (5%), Total, "Place Order [F5]" button
 *   - Success screen: CheckCircle icon, "Order Created" heading, order_no (font-mono),
 *     "New Order" button, "View Order" button, "View Orders" button
 *   - Product search modal (fullscreen): search input, results table with columns
 *     (#, Product, Batch, Stock, Price), qty input at bottom, "Esc" close button
 */

class SalesOrderPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Customer panel (left) ────────────────────────────────────────
    this.phoneInput = page.getByPlaceholder(/\+975/)
    this.nameInput = page.getByPlaceholder(/customer name/i)
    this.addressInput = page.getByPlaceholder(/delivery address/i)
    this.useGpsButton = page.getByRole('button', { name: /use gps/i })
    this.searchProductsButton = page.getByRole('button', { name: /search products/i })

    // ── Order table (right) ──────────────────────────────────────────
    this.orderTable = page.locator('table.w-full')
    this.itemRows = page.locator('table.w-full tbody tr')
    this.emptyState = page.locator('text=Press any key to search and add products')

    // ── Totals ───────────────────────────────────────────────────────
    this.subtotalText = page.locator('text=Subtotal:')
    this.gstText = page.locator('text=GST (5%):')
    this.totalText = page.locator('span.text-lg.font-bold.text-primary')

    // ── Action buttons ───────────────────────────────────────────────
    this.placeOrderButton = page.getByRole('button', { name: /place order/i })

    // ── Error banner ─────────────────────────────────────────────────
    this.errorBanner = page.locator('div.bg-tibetan\\/10')

    // ── Success screen ───────────────────────────────────────────────
    this.successIcon = page.locator('svg.lucide-check-circle')
    this.successHeading = page.getByRole('heading', { name: /order created/i })
    this.orderNoText = page.locator('p.text-muted-foreground.font-mono')
    this.newOrderButton = page.getByRole('button', { name: /new order/i })
    this.viewOrderButton = page.getByRole('button', { name: 'View Order', exact: true })
    this.viewOrdersButton = page.getByRole('button', { name: /view orders/i })

    // ── Product search modal ─────────────────────────────────────────
    this.searchModal = page.locator('.fixed.inset-0.z-50')
    this.searchInput = page.locator('.fixed.inset-0.z-50 input[type="text"]')
    this.searchResults = page.locator('.fixed.inset-0.z-50 table tbody tr')
    this.searchQtyInput = page.locator('.fixed.inset-0.z-50 input[type="number"]')
    this.searchCloseButton = page.locator('.fixed.inset-0.z-50 button:has-text("Esc")')
    this.searchNoResults = page.locator('.fixed.inset-0.z-50').locator('text=No products found')

    // ── Loading spinner ──────────────────────────────────────────────
    this.loadingSpinner = page.locator('svg.lucide-loader-2.animate-spin')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  /** Navigate to the Sales Order page and wait for network idle. */
  async goto() {
    await this.page.goto('/salesorder')
    await this.page.waitForLoadState('networkidle')
  }

  // ── Customer Details ────────────────────────────────────────────────

  /**
   * Fill customer phone number.
   * @param {string} phone
   */
  async fillPhone(phone) {
    await this.phoneInput.fill(phone)
  }

  /**
   * Fill customer name.
   * @param {string} name
   */
  async fillName(name) {
    await this.nameInput.fill(name)
  }

  /**
   * Fill delivery address.
   * @param {string} address
   */
  async fillAddress(address) {
    await this.addressInput.fill(address)
  }

  /**
   * Fill all customer details at once.
   * @param {string} phone
   * @param {string} name
   * @param {string} address
   */
  async fillCustomerDetails(phone, name, address) {
    await this.fillPhone(phone)
    await this.fillName(name)
    await this.fillAddress(address)
  }

  /** Click the "Use GPS" button. */
  async clickUseGps() {
    await this.useGpsButton.click()
  }

  // ── Product Search Modal ────────────────────────────────────────────

  /** Open the product search modal by clicking "Search products..." button. */
  async openSearch() {
    await this.searchProductsButton.click()
    await expect(this.searchModal).toBeVisible({ timeout: 5000 })
  }

  /**
   * Search for a product by typing in the search modal input.
   * Waits for results to appear (or for the "no results" state).
   * @param {string} query
   */
  async searchProduct(query) {
    await this.searchInput.fill(query)
    // Wait for either results or "no results" to appear
    await this.page.waitForTimeout(300) // debounce
    await this.page.waitForFunction(
      (modalSel) => {
        const modal = document.querySelector(modalSel)
        if (!modal) return false
        const rows = modal.querySelectorAll('table tbody tr')
        const noResults = modal.textContent.includes('No products found')
        return rows.length > 0 || noResults
      },
      '.fixed.inset-0.z-50',
      { timeout: 10000 }
    )
  }

  /**
   * Add a product from search results by clicking on it.
   * @param {number} index - 0-based result index
   */
  async addSearchResult(index) {
    await this.searchResults.nth(index).click()
  }

  /**
   * Set the quantity in the search modal's qty input before adding.
   * @param {number} qty
   */
  async setSearchQty(qty) {
    await this.searchQtyInput.fill(String(qty))
  }

  /** Close the search modal. */
  async closeSearch() {
    await this.searchCloseButton.click()
  }

  /**
   * Full flow: open search, type query, wait for results, add first result.
   * @param {string} query - product name or SKU to search
   * @param {number} [qty=1] - quantity to add
   */
  async addProductViaSearch(query, qty = 1) {
    await this.openSearch()
    await this.searchQtyInput.fill(String(qty))
    await this.searchProduct(query)
    await this.addSearchResult(0)
    // Modal auto-closes after adding
  }

  // ── Order Table ─────────────────────────────────────────────────────

  /**
   * Get the number of items in the order table.
   * @returns {Promise<number>}
   */
  async getItemCount() {
    return this.itemRows.count()
  }

  /**
   * Get all item names currently in the order table.
   * @returns {Promise<string[]>}
   */
  async getItemNames() {
    const count = await this.itemRows.count()
    const names = []
    for (let i = 0; i < count; i++) {
      const nameEl = this.itemRows.nth(i).locator('p.truncate')
      const text = await nameEl.textContent()
      names.push(text.trim())
    }
    return names
  }

  /**
   * Click the increment (+) button for an item row.
   * @param {number} index - 0-based row index
   */
  async incrementItemQty(index) {
    const row = this.itemRows.nth(index)
    const plusBtn = row.locator('button:has(svg.lucide-plus)')
    await plusBtn.click()
  }

  /**
   * Click the decrement (-) button for an item row.
   * @param {number} index - 0-based row index
   */
  async decrementItemQty(index) {
    const row = this.itemRows.nth(index)
    const minusBtn = row.locator('button:has(svg.lucide-minus)')
    await minusBtn.click()
  }

  /**
   * Click on an item's quantity to edit it inline.
   * @param {number} index - 0-based row index
   */
  async editItemQty(index) {
    const row = this.itemRows.nth(index)
    const qtyButton = row.locator('button.w-10')
    await qtyButton.click()
  }

  /**
   * Set the quantity of an item being edited via the inline input.
   * @param {string} qty
   */
  async setEditingQty(qty) {
    const editInput = this.page.locator('input[type="number"].w-16')
    await editInput.fill(String(qty))
  }

  /**
   * Confirm the inline qty edit by pressing Enter.
   */
  async confirmEditQty() {
    const editInput = this.page.locator('input[type="number"].w-16')
    await editInput.press('Enter')
  }

  /**
   * Remove an item from the order by clicking its trash icon.
   * @param {number} index - 0-based row index
   */
  async removeItem(index) {
    const row = this.itemRows.nth(index)
    const trashBtn = row.locator('button:has(svg.lucide-trash-2)')
    await trashBtn.click()
  }

  // ── Totals ──────────────────────────────────────────────────────────

  /**
   * Get the subtotal amount as a number.
   * @returns {Promise<number>}
   */
  async getSubtotal() {
    const el = this.page.locator('strong').filter({ hasText: /Nu\./ }).first()
    const text = await el.textContent()
    return parseFloat(text.replace('Nu.', '').trim())
  }

  /**
   * Get the GST total amount as a number.
   * @returns {Promise<number>}
   */
  async getGstTotal() {
    const el = this.page.locator('text=GST (5%):').locator('..').locator('strong')
    const text = await el.textContent()
    return parseFloat(text.replace('Nu.', '').trim())
  }

  /**
   * Get the grand total amount as a number.
   * @returns {Promise<number>}
   */
  async getGrandTotal() {
    const text = await this.totalText.textContent()
    return parseFloat(text.replace('Total: Nu.', '').replace('Nu.', '').trim())
  }

  // ── Submit ──────────────────────────────────────────────────────────

  /** Click the "Place Order [F5]" button. */
  async placeOrder() {
    await this.placeOrderButton.click()
  }

  // ── Success Screen ──────────────────────────────────────────────────

  /** Click "View Order" on the success screen. */
  async clickViewOrder() {
    await this.viewOrderButton.click()
  }

  /** Click "New Order" on the success screen. */
  async clickNewOrder() {
    await this.newOrderButton.click()
  }

  /** Click "View Orders" on the success screen. */
  async clickViewOrders() {
    await this.viewOrdersButton.click()
  }

  /**
   * Get the order number from the success screen.
   * @returns {Promise<string>}
   */
  async getSuccessOrderNo() {
    return (await this.orderNoText.textContent()).trim()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page has loaded with the phone input visible. */
  async assertPageLoaded() {
    await expect(this.phoneInput).toBeVisible({ timeout: 15000 })
  }

  /** Assert the success screen is shown after placing an order. */
  async assertSuccess() {
    await expect(this.successHeading).toBeVisible({ timeout: 15000 })
  }

  /** Assert the empty order state is shown (no items added yet). */
  async assertEmptyState() {
    await expect(this.emptyState).toBeVisible()
  }

  /**
   * Assert the number of items in the order table.
   * @param {number} count
   */
  async assertItemCount(count) {
    await expect(this.itemRows).toHaveCount(count)
  }

  /** Assert the error banner is visible. */
  async assertErrorVisible() {
    await expect(this.errorBanner).toBeVisible()
  }

  /**
   * Assert the error banner contains specific text.
   * @param {string} text
   */
  async assertErrorContains(text) {
    await expect(this.errorBanner).toContainText(text)
  }

  /** Assert the "Place Order" button is disabled. */
  async assertPlaceOrderDisabled() {
    await expect(this.placeOrderButton).toBeDisabled()
  }

  /** Assert the "Place Order" button is enabled. */
  async assertPlaceOrderEnabled() {
    await expect(this.placeOrderButton).toBeEnabled()
  }

  /** Assert the product search modal is visible. */
  async assertSearchModalVisible() {
    await expect(this.searchModal).toBeVisible()
  }

  /** Assert the product search modal is NOT visible. */
  async assertSearchModalNotVisible() {
    await expect(this.searchModal).not.toBeVisible()
  }
}

module.exports = { SalesOrderPage }
