const { expect } = require('@playwright/test')

/**
 * Page object for the Scan Bill modal dialog.
 *
 * Covers: camera capture, file upload, processing state, success/failure
 * overlays, retry, and cancel actions.
 */
class ScanBillModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page

    // ── Locators ─────────────────────────────────────────────────────
    this.dialog = page.locator('[role="dialog"]')
    this.title = this.dialog.locator('h2:text("Scan Wholesale Bill")')

    // Choose mode buttons
    this.useCameraButton = this.dialog.locator('button:has-text("Use Camera")')
    this.uploadPhotoButton = this.dialog.locator('button:has-text("Upload Photo")')
    this.cancelChooseButton = this.dialog.locator('div.p-4 button:has-text("Cancel")')

    // Hidden file input
    this.fileInput = this.dialog.locator('input[type="file"][accept="image/*"]')

    // Camera viewfinder
    this.videoElement = this.dialog.locator('video')
    this.captureButton = this.dialog.locator('button:has-text("Capture")')

    // Processing overlay
    this.processingSpinner = this.dialog.locator('svg.lucide-loader-2.animate-spin')
    this.processingText = this.dialog.locator('text=Parsing bill with AI...')

    // Success overlay
    this.successIcon = this.dialog.locator('svg.lucide-check-circle')
    this.successText = this.dialog.locator('text=Bill scanned successfully')

    // Failed overlay
    this.failedIcon = this.dialog.locator('svg.lucide-x-circle')
    this.failedText = this.dialog.locator('text=Scanning failed')
    this.retryButton = this.dialog.locator('button:has-text("Try Again")')
    this.cancelFailedButton = this.dialog.locator('div.p-6 button:has-text("Cancel")')
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /** Click the "Use Camera" button to start the camera viewfinder. */
  async clickUseCamera() {
    await this.useCameraButton.click()
  }

  /** Click the "Upload Photo" button (triggers hidden file input). */
  async clickUpload() {
    await this.uploadPhotoButton.click()
  }

  /**
   * Upload a file directly via the hidden file input.
   * @param {string} filePath - path to the test image file
   */
  async uploadFile(filePath) {
    await this.fileInput.setInputFiles(filePath)
  }

  /** Click the "Capture" button in camera mode. */
  async clickCapture() {
    await this.captureButton.click()
  }

  /** Click "Cancel" in the choose mode screen. */
  async clickCancel() {
    await this.cancelChooseButton.click()
  }

  /** Click "Try Again" after a failure to return to choose mode. */
  async clickRetry() {
    await this.retryButton.click()
  }

  // ── Assertions ──────────────────────────────────────────────────────

  /** Assert the modal is visible with the title. */
  async assertOpen() {
    await expect(this.dialog).toBeVisible({ timeout: 5000 })
    await expect(this.title).toBeVisible()
  }

  /** Assert the modal is closed. */
  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  /** Assert the processing spinner and text are visible. */
  async assertProcessing() {
    await expect(this.processingText).toBeVisible({ timeout: 10000 })
  }

  /** Assert the success overlay is visible. */
  async assertSuccess() {
    await expect(this.successText).toBeVisible({ timeout: 15000 })
  }

  /** Assert the failed overlay is visible. */
  async assertFailed() {
    await expect(this.failedText).toBeVisible({ timeout: 15000 })
  }

  /**
   * Get the error message text from the failed overlay.
   * @returns {Promise<string>}
   */
  async getErrorText() {
    const errorDesc = this.dialog.locator('div.p-6 p.text-slate-400')
    return errorDesc.textContent()
  }
}

module.exports = { ScanBillModal }
