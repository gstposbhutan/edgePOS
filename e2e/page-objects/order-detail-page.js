const { expect } = require('@playwright/test')

/**
 * Page object for the Order Detail page (/pos/orders/[id]).
 *
 * Covers: order summary, items, timeline, cancel/refund actions, WhatsApp badges.
 */
class OrderDetailPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    // Header
    this.orderNoHeading = page.locator('h1.font-mono.font-bold')

    // WhatsApp source badge
    this.whatsappBadge = page.locator('span:has-text("WhatsApp Order")')

    // Status badge (rendered by OrderStatusBadge component)
    this.statusBadge = page.locator('span.inline-flex.rounded-full').last()

    // Summary cards
    this.grandTotalCard = page.locator('text=Grand Total').locator('..')
    this.gstTotalText = page.locator('text=GST: Nu.')
    this.paymentMethodText = page.locator('text=Payment').locator('..').locator('p.font-semibold')

    // Action buttons
    this.viewReceiptButton = page.getByRole('button', { name: /View Receipt/i })
    this.cancelOrderButton = page.getByRole('button', { name: /Cancel Order/i })
    this.requestRefundButton = page.getByRole('button', { name: /Request Refund/i })
    this.refreshButton = page.locator('button[title="Refresh"]')

    // Unmatched items warning
    this.unmatchedWarning = page.locator('text=Unmatched Items')

    // Items section
    this.itemsSection = page.locator('p:text-is("Items")').locator('..')
    this.itemRows = page.locator('div.space-y-2 > div.flex.items-center.gap-3')

    // Timeline section
    this.timelineSection = page.locator('p:text-is("Status History")').locator('..')
    this.timelineEntries = page.locator('div.space-y-0 > div.flex.gap-3')

    // Refunds section
    this.refundsSection = page.locator('p:text-is("Refunds")').locator('..')
    this.refundRows = page.locator('div.space-y-2 > div.flex.items-center.justify-between')

    // Loading spinner
    this.loadingSpinner = page.locator('svg.lucide-loader-2.animate-spin')
  }

  // ── Navigation ──────────────────────────────────────────────────────

  async goto(orderId) {
    await this.page.goto(`/pos/orders/${orderId}`)
    await this.page.waitForLoadState('networkidle')
  }

  /** Click the back arrow button to return to orders list. */
  async clickBack() {
    const backButton = this.page.locator('button:has(svg.lucide-arrow-left)').first()
    await backButton.click()
    await this.page.waitForURL('**/pos/orders')
  }

  // ── Summary Queries ─────────────────────────────────────────────────

  /**
   * Get the order status from the badge text.
   * @returns {Promise<string>} e.g. "Confirmed", "Cancelled"
   */
  async getStatus() {
    return this.statusBadge.textContent()
  }

  /**
   * Assert the order status matches the expected text.
   * @param {string} status - e.g. "Confirmed", "Cancelled", "Delivered"
   */
  async assertStatus(status) {
    await expect(this.statusBadge).toHaveText(status)
  }

  /**
   * Get the grand total amount as a number.
   * @returns {Promise<number>}
   */
  async getGrandTotal() {
    const text = await this.page.locator('text=Grand Total').locator('..').locator('p.text-lg').textContent()
    return parseFloat(text.replace('Nu.', '').trim())
  }

  /**
   * Get the GST total amount as a number.
   * @returns {Promise<number>}
   */
  async getGstTotal() {
    const el = this.page.locator('p:has-text("GST: Nu.")')
    const text = await el.textContent()
    return parseFloat(text.replace('GST: Nu.', '').trim())
  }

  /**
   * Get the payment method text.
   * @returns {Promise<string>} e.g. "CASH", "MBOB", "MPAY"
   */
  async getPaymentMethod() {
    return this.paymentMethodText.textContent()
  }

  // ── Item Queries ────────────────────────────────────────────────────

  /**
   * Get all item name texts.
   * @returns {Promise<string[]>}
   */
  async getItemNames() {
    const count = await this.itemRows.count()
    const names = []
    for (let i = 0; i < count; i++) {
      const name = await this.itemRows.nth(i).locator('p.text-xs.font-medium').textContent()
      names.push(name)
    }
    return names
  }

  /** Number of order items visible. */
  async getItemCount() {
    return this.itemRows.count()
  }

  // ── Timeline Queries ────────────────────────────────────────────────

  /**
   * Get status texts from the timeline entries.
   * @returns {Promise<string[]>}
   */
  async getTimelineStatuses() {
    const count = await this.timelineEntries.count()
    const statuses = []
    for (let i = 0; i < count; i++) {
      const text = await this.timelineEntries.nth(i).locator('p.text-sm.font-medium').textContent()
      statuses.push(text)
    }
    return statuses
  }

  // ── Refund Queries ──────────────────────────────────────────────────

  /** Number of visible refund rows. */
  async getRefundCount() {
    return this.refundRows.count()
  }

  // ── Action Buttons ──────────────────────────────────────────────────

  /** Click the "Cancel Order" button. */
  async clickCancelOrder() {
    await this.cancelOrderButton.click()
  }

  /** Click the "Request Refund" button. */
  async clickRequestRefund() {
    await this.requestRefundButton.click()
  }

  /** Click the "View Receipt" button. */
  async clickViewReceipt() {
    await this.viewReceiptButton.click()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the page has loaded with an order number heading. */
  async assertPageLoaded() {
    await expect(this.orderNoHeading).toBeVisible({ timeout: 15000 })
  }

  /** Assert the cancel order button is visible. */
  async assertCancelButtonVisible() {
    await expect(this.cancelOrderButton).toBeVisible()
  }

  /** Assert the cancel order button is NOT visible. */
  async assertCancelButtonNotVisible() {
    await expect(this.cancelOrderButton).not.toBeVisible()
  }

  /** Assert the request refund button is visible. */
  async assertRefundButtonVisible() {
    await expect(this.requestRefundButton).toBeVisible()
  }

  /** Assert the request refund button is NOT visible. */
  async assertRefundButtonNotVisible() {
    await expect(this.requestRefundButton).not.toBeVisible()
  }

  /** Assert the WhatsApp Order badge is visible. */
  async assertWhatsappBadge() {
    await expect(this.whatsappBadge).toBeVisible()
  }

  /**
   * Get the unmatched items warning text.
   * @returns {Promise<string|null>}
   */
  async getUnmatchedWarning() {
    if (await this.unmatchedWarning.isVisible({ timeout: 2000 }).catch(() => false)) {
      return this.unmatchedWarning.locator('..').textContent()
    }
    return null
  }

  /** Assert the unmatched items warning is visible. */
  async assertUnmatchedWarning() {
    await expect(this.unmatchedWarning).toBeVisible()
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

module.exports = { OrderDetailPage }
