const { expect } = require('@playwright/test')

/**
 * Page object for the PaymentScannerModal.
 * Covers OCR-based payment verification flow for mBoB, mPay, and RTGS.
 *
 * Modal phases: guide -> scanning -> verifying -> success | failed
 */
class PaymentScannerModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Dialog root ──────────────────────────────────────────────────
    // The modal uses a Dialog with a dark bg-obsidian inner container
    this.dialog = page.locator('[role="dialog"]')

    // Title text like "Verify mBoB Payment"
    this.title = this.dialog.locator('h2')

    // Expected amount text
    this.expectedAmountText = this.dialog.locator('text=/Expected:/')

    // ── Phase-specific overlays ───────────────────────────────────────
    // "Gemini Vision analysing..." text during verifying phase
    this.verifyingOverlay = this.dialog.locator('text=Gemini Vision analysing...')

    // Success phase
    this.successOverlay = this.dialog.locator('text=Payment Verified')

    // Failed phase
    this.failedOverlay = this.dialog.locator('text=Verification Failed')

    // ── Action buttons ────────────────────────────────────────────────
    this.captureButton = this.dialog.locator('button', { hasText: /^Capture$/ })
    this.confirmButton = this.dialog.locator('button', { hasText: /Confirm Order/ })
    this.retryButton = this.dialog.locator('button', { hasText: /Retry/ })
    this.cancelButton = this.dialog.locator('[role="dialog"] button', { hasText: /^Cancel$/ }).first()
    this.maxRetriesButton = this.dialog.locator('button', { hasText: /Max retries reached/ })

    // ── Result details ────────────────────────────────────────────────
    this.referenceText = this.dialog.locator('text=/Ref:/')
    this.confidenceText = this.dialog.locator('text=/Confidence:/')
    this.attemptText = this.dialog.locator('text=/Attempt \\d/')
    this.extractedAmountText = this.dialog.locator('text=/Amount: Nu\\./')

    // Reason shown on failure
    this.failedReasonText = this.dialog.locator('.bg-red-900\\/70 p.text-slate-300')
  }

  // ── Assertions ──────────────────────────────────────────────────────

  async assertOpen() {
    await expect(this.dialog).toBeVisible({ timeout: 10000 })
  }

  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /** Click the Capture button (available during scanning phase). */
  async clickCapture() {
    await this.captureButton.click()
  }

  /** Click Confirm Order after successful verification. */
  async clickConfirm() {
    await this.confirmButton.click()
  }

  /** Click Retry after a failed verification. */
  async clickRetry() {
    await this.retryButton.click()
  }

  /** Click Cancel to close the modal. */
  async clickCancel() {
    await this.cancelButton.click()
  }

  // ── State queries ───────────────────────────────────────────────────

  /**
   * Returns the current phase of the modal.
   * @returns {Promise<'guide'|'scanning'|'verifying'|'success'|'failed'|'closed'>}
   */
  async getPhase() {
    if (!(await this.dialog.isVisible())) return 'closed'
    if (await this.successOverlay.isVisible()) return 'success'
    if (await this.failedOverlay.isVisible()) return 'failed'
    if (await this.verifyingOverlay.isVisible()) return 'verifying'
    if (await this.captureButton.isVisible()) return 'scanning'
    return 'guide'
  }

  /**
   * Returns the extracted reference number from the success overlay.
   * Text appears as "Ref: XXXXXXX".
   */
  async getReferenceText() {
    const refEl = this.dialog.locator('p.font-mono')
    if (!(await refEl.isVisible())) return null
    const text = await refEl.textContent()
    return text.replace('Ref:', '').trim()
  }

  /**
   * Returns the payment method label from the modal title.
   * e.g. "Verify mBoB Payment" -> "mBoB"
   */
  async getPaymentMethodLabel() {
    const text = await this.title.textContent()
    const match = text.match(/Verify (.+?) Payment/)
    return match ? match[1] : null
  }
}

module.exports = { PaymentScannerModal }
