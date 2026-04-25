const { BasePage } = require('./base-page')

/**
 * LoginPage — page object for /(auth)/login.
 *
 * Selectors are derived from the actual login page JSX:
 *   - Tabs are plain <button> elements with text "Email" and "WhatsApp"
 *   - Email field: <input type="email"> with label "Email"
 *   - Password field: <input type="password|text"> with label "Password"
 *   - Password toggle: a <button type="button"> next to the password field
 *   - Email submit: <button> "Sign In"
 *   - WhatsApp phone: <input type="tel"> with label "WhatsApp Number"
 *   - Send OTP: <button> "Send Verification Code"
 *   - OTP: six single-digit <input maxlength="1"> elements
 *   - Verify OTP: <button> "Verify & Sign In"
 *   - Change number: <button type="button"> "Change number"
 *   - Resend code: <button type="button"> "Resend code" / "Resend in Ns"
 *   - Error alerts: <div> containing <p> with error text (bg-tibetan)
 *   - Forgot password: <a href="/login/reset">
 */
class LoginPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page)

    // ── Locators (built from actual JSX) ───────────────────────────

    // Logo / header
    this.logo = page.getByText('NEXUS BHUTAN')
    this.heading = page.getByRole('heading', { name: /sign in/i })

    // Tabs
    this.emailTab = page.getByRole('button', { name: /^email$/i })
    this.whatsAppTab = page.getByRole('button', { name: /^whatsapp$/i })

    // Email form
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')
    this.passwordToggle = page.locator('button[type="button"]').filter({
      has: page.locator('svg.lucide-eye, svg.lucide-eye-off'),
    })
    this.signInButton = page.getByRole('button', { name: /sign in/i })

    // Forgot password
    this.forgotPasswordLink = page.getByRole('link', { name: /reset via email or whatsapp/i })

    // WhatsApp phone form
    this.phoneInput = page.getByLabel('WhatsApp Number')
    this.sendOtpButton = page.getByRole('button', { name: /send verification code/i })

    // OTP verification form
    this.otpLabel = page.getByText('Enter 6-digit code')
    this.otpInputContainer = page.locator('div.flex.gap-2.justify-center')
    this.verifyOtpButton = page.getByRole('button', { name: /verify & sign in/i })

    // OTP actions
    this.changeNumberButton = page.getByRole('button', { name: /change number/i })
    this.resendCodeButton = page.getByRole('button', { name: /resend code/i })

    // Error alert (bg-tibetan container)
    this.errorAlert = page.locator('div.bg-tibetan\\/10 p')
  }

  // ── Navigation ─────────────────────────────────────────────────────

  /**
   * Navigate to the login page.
   */
  async goto() {
    await this.navigate('/login')
    await this.heading.waitFor({ state: 'visible' })
  }

  // ── Tab switching ──────────────────────────────────────────────────

  /**
   * Switch to the Email tab.
   */
  async switchToEmailTab() {
    await this.emailTab.click()
  }

  /**
   * Switch to the WhatsApp tab.
   */
  async switchToWhatsAppTab() {
    await this.whatsAppTab.click()
  }

  // ── Email login ────────────────────────────────────────────────────

  /**
   * Complete the email/password login flow.
   * @param {string} email
   * @param {string} password
   * @param {object} [options]
   * @param {number} [options.timeout] - max wait for redirect (default 30 000 ms)
   */
  async loginWithEmail(email, password, { timeout = 30000 } = {}) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.signInButton.click()
    // Wait for redirect away from /login
    await this.page.waitForURL('**/pos**', { timeout }).catch(() => {})
  }

  // ── WhatsApp OTP login ─────────────────────────────────────────────

  /**
   * Complete the WhatsApp OTP login flow (send + verify).
   * @param {string} phone - E.164 format, e.g. '+97517100001'
   * @param {string} otp - 6-digit code
   */
  async loginWithWhatsApp(phone, otp) {
    await this.switchToWhatsAppTab()
    await this.phoneInput.fill(phone)
    await this.clickSendOtp()
    // Wait for OTP form to appear
    await this.otpLabel.waitFor({ state: 'visible' })
    await this.fillOtp(otp)
    await this.clickVerifyOtp()
    await this.page.waitForURL('**/pos**', { timeout: 30000 }).catch(() => {})
  }

  // ── OTP helpers ────────────────────────────────────────────────────

  /**
   * Send the WhatsApp OTP.
   */
  async clickSendOtp() {
    await this.sendOtpButton.click()
  }

  /**
   * Get the six individual OTP digit input locators.
   * @returns {Promise<import('@playwright/test').Locator[]>}
   */
  async getOtpInputs() {
    // Each OTP input is maxlength="1" inside the flex container
    const container = this.otpInputContainer
    const inputs = []
    for (let i = 0; i < 6; i++) {
      inputs.push(container.locator('input').nth(i))
    }
    return inputs
  }

  /**
   * Fill a 6-digit OTP code into the individual digit inputs.
   * @param {string} code - exactly 6 digits
   */
  async fillOtp(code) {
    const inputs = await this.getOtpInputs()
    for (let i = 0; i < 6; i++) {
      await inputs[i].fill(code[i] || '')
    }
  }

  /**
   * Click the "Verify & Sign In" button.
   */
  async clickVerifyOtp() {
    await this.verifyOtpButton.click()
  }

  /**
   * Click the "Resend code" button (only active after cooldown).
   */
  async clickResendOtp() {
    await this.resendCodeButton.click()
  }

  /**
   * Click the "Change number" link to go back to the phone entry form.
   */
  async clickChangeNumber() {
    await this.changeNumberButton.click()
  }

  // ── Password visibility ────────────────────────────────────────────

  /**
   * Toggle the password field between visible and hidden.
   */
  async togglePasswordVisibility() {
    await this.passwordToggle.click()
  }

  /**
   * Check whether the password field is currently showing plain text.
   * @returns {Promise<boolean>}
   */
  async isPasswordVisible() {
    const type = await this.passwordInput.getAttribute('type')
    return type === 'text'
  }

  // ── Error messages ─────────────────────────────────────────────────

  /**
   * Get the current error/alert message text, or null if none visible.
   * @returns {Promise<string|null>}
   */
  async getErrorText() {
    const isVisible = await this.errorAlert.isVisible({ timeout: 2000 }).catch(() => false)
    if (!isVisible) return null
    return this.errorAlert.textContent()
  }
}

module.exports = { LoginPage }
