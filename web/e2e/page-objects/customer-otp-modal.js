const { expect } = require('@playwright/test')

/**
 * Page object for the CustomerOtpModal — WhatsApp OTP verification before
 * CREDIT checkout.
 *
 * Two-step modal: phone entry → OTP entry → onVerified(phone) callback.
 * Tests should mock /api/auth/whatsapp/send + /verify before opening this.
 */
class CustomerOtpModal {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page

    this.dialog = page.locator('[role="dialog"]', { hasText: /Verify Customer Identity/i })
    this.phoneInput = this.dialog.locator('input[type="tel"]')
    this.sendOtpButton = this.dialog.getByRole('button', { name: /Send OTP/i })
    this.otpInputs = this.dialog.locator('input[inputmode="numeric"]')
    this.verifyButton = this.dialog.getByRole('button', { name: /Verify & Proceed/i })
    this.errorText = this.dialog.locator('p.text-tibetan')
    this.changeNumberButton = this.dialog.getByRole('button', { name: /Change number/i })
  }

  async assertOpen() {
    await expect(this.dialog).toBeVisible()
  }

  async assertClosed() {
    await expect(this.dialog).not.toBeVisible()
  }

  /** Send-OTP step: fill phone and click Send OTP. */
  async enterPhone(phone) {
    await expect(this.phoneInput).toBeVisible()
    await this.phoneInput.fill(phone)
    await this.sendOtpButton.click()
    // Wait for the modal to transition to the 6-digit OTP step.
    await expect(this.otpInputs.first()).toBeVisible()
  }

  /** OTP step: enter the 6-digit code via paste (one keystroke). */
  async enterOtp(code) {
    if (!/^\d{6}$/.test(code)) throw new Error(`enterOtp expects 6 digits, got '${code}'`)
    // The modal supports paste-into-first-input; that's faster than typing each.
    await this.otpInputs.first().focus()
    await this.page.evaluate(async (text) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      const target = document.activeElement
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    }, code)
  }

  /** Convenience: phone + OTP + verify in one call. */
  async fillAndVerify(phone, code) {
    await this.enterPhone(phone)
    await this.enterOtp(code)
    await this.verifyButton.click()
  }
}

module.exports = { CustomerOtpModal }
