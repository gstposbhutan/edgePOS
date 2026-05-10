const { expect } = require('@playwright/test')

/**
 * Page object for /pos/purchases/[id] — Purchase order/invoice detail page.
 *
 * Selectors derived from app/pos/purchases/[id]/page.jsx:
 *   - Header: breadcrumb "POS / Purchases / {order_no}", status badge, refresh button
 *   - For POs: "Convert to Purchase Invoice [F3]" button, "Mark as Sent to Supplier" button, "Cancel PO" button
 *   - For Invoices: "Confirm Receipt — Create Stock Batches" button (emerald bg)
 *   - Items table: Product, Qty, Unit Cost, Total, Batch (for invoices)
 *   - Related Invoices section showing linked invoices
 *   - Confirmed success banner: "Goods Received & Stock Updated"
 *   - Status History section
 *   - Convert overlay (fullscreen): payment method select, supplier ref input,
 *     line items with batch fields (qty, unit_cost, mrp, sell_price, batch#, expiry),
 *     "+ Batch" button, "Create Purchase Invoice [F5]" button
 */

class PurchaseDetailPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Header locators ──────────────────────────────────────────────
    this.orderNoText = page.locator('.font-mono.font-medium.truncate')
    this.statusBadge = page.locator('span.rounded-full').first()
    this.refreshButton = page.locator('button[title="Refresh [F5]"]')
    this.printButton = page.getByRole('button', { name: /print/i })

    // ── Breadcrumb ───────────────────────────────────────────────────
    this.breadcrumb = page.locator('div.flex.items-center.gap-1.text-xs.text-muted-foreground')
    this.posBreadcrumb = page.getByRole('button', { name: 'POS' })
    this.purchasesBreadcrumb = page.getByRole('button', { name: 'Purchases' })

    // ── Action buttons ───────────────────────────────────────────────
    this.convertButton = page.getByRole('button', { name: /convert to purchase invoice/i })
    this.markSentButton = page.getByRole('button', { name: /mark as sent/i })
    this.cancelButton = page.getByRole('button', { name: /cancel po/i })
    this.confirmReceiptButton = page.getByRole('button', { name: /confirm receipt/i })

    // ── Supplier & Details cards ─────────────────────────────────────
    this.supplierCard = page.locator('div').filter({ hasText: /^Supplier/ }).first()
    this.detailsCard = page.locator('div').filter({ hasText: /^Details/ }).first()
    this.supplierName = page.locator('p.text-sm:has(+ p.text-xs.text-muted-foreground)').first()

    // ── Items table ──────────────────────────────────────────────────
    this.itemsHeader = page.locator('p.text-sm.font-semibold').filter({ hasText: /Items/ })
    this.itemRows = page.locator('table.w-full tbody tr')
    this.totalRow = page.locator('p.text-base.font-bold.text-primary')

    // ── Related invoices section ─────────────────────────────────────
    this.relatedInvoicesSection = page.locator('p.text-sm.font-semibold').filter({ hasText: /Related Invoices/ })
    this.relatedInvoiceRows = page.locator('div.divide-y button').filter({ hasText: /Nu\./ })

    // ── Confirmed success banner ─────────────────────────────────────
    this.confirmedBanner = page.locator('text=Goods Received & Stock Updated')

    // ── Status History section ───────────────────────────────────────
    this.statusHistorySection = page.locator('p.text-sm.font-semibold').filter({ hasText: /Status History/ })
    this.timelineEntries = page.locator('div.p-4.space-y-2 > div.flex.items-center.gap-3')

    // ── Fully received banner ────────────────────────────────────────
    this.fullyReceivedBanner = page.locator('text=All items fully invoiced')

    // ── Action error banner ──────────────────────────────────────────
    this.actionError = page.locator('div.bg-tibetan\\/10')

    // ── Not found state ──────────────────────────────────────────────
    this.notFoundMessage = page.locator('text=Purchase order not found')
    this.backToPurchasesButton = page.getByRole('button', { name: /back to purchases/i })

    // ── Convert overlay (PurchaseInvoiceOverlay) ─────────────────────
    this.convertOverlay = page.locator('.fixed.inset-0.z-50')
    this.overlayCloseButton = page.locator('.fixed.inset-0.z-50 button:has(svg.lucide-x)').last()
    this.payMethodSelect = page.locator('.fixed.inset-0.z-50 select').first()
    this.supplierRefInput = page.locator('.fixed.inset-0.z-50 input[placeholder="e.g. INV-888"]')
    this.createInvoiceButton = page.getByRole('button', { name: /create purchase invoice/i })
    this.addBatchButtons = page.locator('button:has-text("+ Batch")')

    // ── Convert overlay — line items in left panel ───────────────────
    this.convertLineItems = page.locator('.fixed.inset-0.z-50 button:has(span.text-xs.truncate)')

    // ── Loading spinner ──────────────────────────────────────────────
    this.loadingSpinner = page.locator('svg.lucide-loader-2.animate-spin')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  /**
   * Navigate to a specific purchase order/invoice detail page.
   * @param {string} id - Purchase order UUID
   */
  async goto(id) {
    await this.page.goto(`/pos/purchases/${id}`)
    await this.page.waitForLoadState('networkidle')
  }

  /** Click the back arrow button to return to the purchases list. */
  async clickBack() {
    const backButton = this.page.locator('button:has(svg.lucide-arrow-left)').first()
    await backButton.click()
    await this.page.waitForURL('**/pos/purchases')
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /** Click "Convert to Purchase Invoice [F3]" button. */
  async clickConvert() {
    await this.convertButton.click()
  }

  /** Click "Mark as Sent to Supplier" button. */
  async clickMarkSent() {
    await this.markSentButton.click()
  }

  /** Click "Cancel PO" button. Note: triggers a browser confirm dialog. */
  async clickCancel() {
    await this.cancelButton.click()
  }

  /** Click "Confirm Receipt — Create Stock Batches" button. Accepts the confirm dialog. */
  async clickConfirmReceipt() {
    this.page.once('dialog', dialog => dialog.accept())
    await this.confirmReceiptButton.click()
  }

  /** Click the refresh button to reload purchase detail. */
  async clickRefresh() {
    await this.refreshButton.click()
  }

  /** Click the Print button (only visible for confirmed invoices). */
  async clickPrint() {
    await this.printButton.click()
  }

  /** Accept the browser confirm dialog (used by Cancel and Confirm Receipt). */
  async acceptConfirmDialog() {
    this.page.once('dialog', dialog => dialog.accept())
  }

  // ── Convert Overlay Actions ─────────────────────────────────────────

  /** Open the convert overlay by clicking the Convert button. */
  async openConvertOverlay() {
    await this.convertButton.click()
    await expect(this.convertOverlay).toBeVisible({ timeout: 5000 })
  }

  /** Close the convert overlay by clicking the X button. */
  async closeConvertOverlay() {
    await this.overlayCloseButton.click()
  }

  /**
   * Select a payment method in the convert overlay.
   * @param {'ONLINE'|'CASH'|'CREDIT'} method
   */
  async selectPaymentMethod(method) {
    await this.payMethodSelect.selectOption(method)
  }

  /**
   * Fill the supplier invoice reference in the convert overlay.
   * @param {string} ref
   */
  async fillSupplierRef(ref) {
    await this.supplierRefInput.fill(ref)
  }

  /**
   * Click the "+ Batch" button for a specific line item in the convert overlay.
   * @param {number} lineIndex - 0-based line index
   */
  async addBatch(lineIndex) {
    await this.addBatchButtons.nth(lineIndex).click()
  }

  /**
   * Fill a batch field for a specific line and sub-batch in the convert overlay.
   * @param {number} lineIndex - 0-based line index
   * @param {number} batchIndex - 0-based sub-batch index
   * @param {string} field - one of: quantity, unit_cost, mrp, selling_price, batch_number, expires_at
   * @param {string} value
   */
  async fillBatchField(lineIndex, batchIndex, field, value) {
    const lineEl = this.page.locator('.fixed.inset-0.z-50 .flex-1.overflow-y-auto > div').nth(lineIndex)
    const subBatchGrid = lineEl.locator('.grid.grid-cols-12').nth(batchIndex)
    const inputLocator = field === 'expires_at'
      ? subBatchGrid.locator('input[type="date"]')
      : subBatchGrid.locator(`input[placeholder="${field === 'unit_cost' || field === 'mrp' || field === 'selling_price' ? '0.00' : field === 'batch_number' ? 'Optional' : ''}"]`)
        .or(subBatchGrid.locator('input[type="number"]').nth(
          ['quantity', 'unit_cost', 'mrp', 'selling_price'].indexOf(field)
        ))

    // Use a more robust approach: locate by the label that precedes the input
    const labels = ['Qty', 'Unit Cost', 'MRP', 'Sell Price', 'Batch #', 'Expiry']
    const labelIndex = ['quantity', 'unit_cost', 'mrp', 'selling_price', 'batch_number', 'expires_at'].indexOf(field)

    // Each sub-batch row is a grid of 12 cols; inputs are in col-span divs
    const colDivs = subBatchGrid.locator('> div')
    const targetDiv = colDivs.nth(labelIndex)
    const input = targetDiv.locator('input')
    await input.fill(value)
  }

  /** Click "Create Purchase Invoice [F5]" in the convert overlay. */
  async clickCreateInvoice() {
    await this.createInvoiceButton.click()
  }

  /**
   * Select a line item in the convert overlay's left panel.
   * @param {number} lineIndex - 0-based index
   */
  async selectConvertLine(lineIndex) {
    await this.convertLineItems.nth(lineIndex).click()
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get the order number from the breadcrumb.
   * @returns {Promise<string>}
   */
  async getOrderNo() {
    return (await this.orderNoText.textContent()).trim()
  }

  /**
   * Get the status badge text.
   * @returns {Promise<string>}
   */
  async getStatus() {
    return (await this.statusBadge.textContent()).trim()
  }

  /**
   * Get the supplier name from the supplier card.
   * @returns {Promise<string>}
   */
  async getSupplierName() {
    const card = this.page.locator('div').filter({ hasText: /^Supplier/ }).first()
    const nameEl = card.locator('p.font-medium')
    return (await nameEl.textContent()).trim()
  }

  /**
   * Get the grand total amount as a number.
   * @returns {Promise<number>}
   */
  async getGrandTotal() {
    const text = await this.totalRow.textContent()
    return parseFloat(text.replace('Total: Nu.', '').replace('Nu.', '').trim())
  }

  /**
   * Get all item names from the items table.
   * @returns {Promise<string[]>}
   */
  async getItemNames() {
    const count = await this.itemRows.count()
    const names = []
    for (let i = 0; i < count; i++) {
      const name = await this.itemRows.nth(i).locator('p.font-medium').textContent()
      names.push(name)
    }
    return names
  }

  /** Number of order items visible. */
  async getItemCount() {
    return this.itemRows.count()
  }

  /**
   * Get the number of related invoices.
   * @returns {Promise<number>}
   */
  async getRelatedInvoiceCount() {
    if (!(await this.relatedInvoicesSection.isVisible({ timeout: 2000 }).catch(() => false))) {
      return 0
    }
    return this.relatedInvoiceRows.count()
  }

  /**
   * Get status texts from the timeline entries.
   * @returns {Promise<string[]>}
   */
  async getTimelineStatuses() {
    const count = await this.timelineEntries.count()
    const statuses = []
    for (let i = 0; i < count; i++) {
      const statusEl = this.timelineEntries.nth(i).locator('span.font-medium')
      if (await statusEl.isVisible({ timeout: 500 }).catch(() => false)) {
        statuses.push((await statusEl.textContent()).trim())
      }
    }
    return statuses
  }

  /**
   * Click a related invoice to navigate to its detail page.
   * @param {number} index - 0-based index
   */
  async clickRelatedInvoice(index) {
    await this.relatedInvoiceRows.nth(index).click()
    await this.page.waitForURL('**/pos/purchases/**')
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page has loaded with an order number in the breadcrumb. */
  async assertPageLoaded() {
    await expect(this.orderNoText).toBeVisible({ timeout: 15000 })
  }

  /**
   * Assert the order status matches the expected text.
   * @param {string} status - e.g. "DRAFT", "SENT", "CONFIRMED", "CANCELLED"
   */
  async assertStatus(status) {
    const badge = this.page.locator(`span.rounded-full:has-text("${status}")`).first()
    await expect(badge).toBeVisible({ timeout: 5000 })
  }

  /** Assert the "Convert to Purchase Invoice" button is visible. */
  async assertConvertButtonVisible() {
    await expect(this.convertButton).toBeVisible()
  }

  /** Assert the "Convert to Purchase Invoice" button is NOT visible. */
  async assertConvertButtonNotVisible() {
    await expect(this.convertButton).not.toBeVisible()
  }

  /** Assert the "Mark as Sent to Supplier" button is visible. */
  async assertMarkSentButtonVisible() {
    await expect(this.markSentButton).toBeVisible()
  }

  /** Assert the "Cancel PO" button is visible. */
  async assertCancelButtonVisible() {
    await expect(this.cancelButton).toBeVisible()
  }

  /** Assert the "Confirm Receipt" button is visible. */
  async assertConfirmReceiptButtonVisible() {
    await expect(this.confirmReceiptButton).toBeVisible()
  }

  /** Assert the confirmed success banner is visible. */
  async assertConfirmedBanner() {
    await expect(this.confirmedBanner).toBeVisible({ timeout: 5000 })
  }

  /** Assert the fully received banner is visible. */
  async assertFullyReceivedBanner() {
    await expect(this.fullyReceivedBanner).toBeVisible()
  }

  /** Assert the "Purchase order not found" state is shown. */
  async assertNotFound() {
    await expect(this.notFoundMessage).toBeVisible()
  }

  /** Assert the related invoices section is visible. */
  async assertRelatedInvoicesVisible() {
    await expect(this.relatedInvoicesSection).toBeVisible()
  }

  /** Assert the convert overlay is visible. */
  async assertConvertOverlayVisible() {
    await expect(this.convertOverlay).toBeVisible({ timeout: 5000 })
  }

  /** Assert the convert overlay is NOT visible. */
  async assertConvertOverlayNotVisible() {
    await expect(this.convertOverlay).not.toBeVisible()
  }

  /**
   * Assert a specific timeline status is present.
   * @param {string} status
   */
  async assertTimelineHasStatus(status) {
    const statuses = await this.getTimelineStatuses()
    expect(statuses).toContain(status)
  }
}

module.exports = { PurchaseDetailPage }
