const { expect } = require('@playwright/test')
const { BasePage } = require('./base-page')

/**
 * RiderPage — page object for the rider delivery portal at /rider.
 *
 * Reflects the CURRENT model:
 *   - Login at /rider/login is EMAIL-OTP (email → 6-digit code → sign in). Under MOCK_WHATSAPP the
 *     code is 123456 and the send step surfaces it as "Dev code: 123456".
 *   - The dashboard shows a QUEUE of orders (worked in any order), each a card with its own
 *     Reject / Confirm Pickup / Confirm Delivery actions.
 *   - An online/offline shift toggle in the header.
 *
 * Selectors derive from app/rider/login/page.jsx, app/rider/page.jsx, components/rider/otp-input-modal.jsx.
 */
class RiderPage extends BasePage {
  constructor(page) {
    super(page)

    // ── Login (/rider/login) — email-OTP ───────────────────────────────
    this.emailInput   = page.getByPlaceholder('you@example.com')
    this.sendCodeBtn  = page.getByRole('button', { name: /send code/i })
    this.codeInput    = page.getByPlaceholder('123456')
    this.signInBtn    = page.getByRole('button', { name: /^sign in$/i })
    this.loginError   = page.locator('div.bg-tibetan\\/10 p')

    // ── Header ─────────────────────────────────────────────────────────
    this.riderName    = page.locator('header p.text-sm.font-bold')
    this.shiftToggle  = page.getByRole('button', { name: /online|offline/i })
    this.refreshButton = page.locator('header button').filter({ has: page.locator('svg.lucide-refresh-cw') })
    this.logoutButton  = page.locator('header button').filter({ has: page.locator('svg.lucide-log-out') })

    // ── Queue ──────────────────────────────────────────────────────────
    this.queueHeading = page.getByText(/your queue/i)
    this.emptyState   = page.getByText(/no orders in your queue/i)

    // ── OTP modal (shared pickup/delivery) ─────────────────────────────
    this.otpModalTitle   = page.locator('div.fixed.inset-0 h2.text-lg.font-bold')
    this.otpInputs       = page.locator('div.fixed.inset-0 div.flex.gap-2.justify-center input')
    this.otpConfirmBtn   = page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i })
    this.otpError        = page.locator('div.fixed.inset-0 div.bg-tibetan\\/10 p')
  }

  // ── Navigation / login ──────────────────────────────────────────────
  async gotoLogin() {
    await this.navigate('/rider/login')
    await this.emailInput.waitFor({ state: 'visible', timeout: 15000 })
  }

  async goto() { await this.navigate('/rider') }

  /**
   * Email-OTP login. In mock mode the code is 123456.
   * @param {string} email
   * @param {string} code
   */
  async login(email, code = '123456', { timeout = 20000 } = {}) {
    await this.emailInput.fill(email)
    await this.sendCodeBtn.click()
    await this.codeInput.waitFor({ state: 'visible', timeout })
    await this.codeInput.fill(code)
    await this.signInBtn.click()
    await this.page.waitForURL('**/rider', { timeout })
  }

  async logout() {
    await this.logoutButton.click()
    await this.page.waitForURL('**/rider/login', { timeout: 10000 })
  }

  // ── Queue ────────────────────────────────────────────────────────────
  // The queue card's outer div is uniquely `border-2 rounded-xl` (the inner header is `border-b`,
  // stat tiles are `border`), so this matches exactly one element per order.
  cardRoot = 'div.border-2.rounded-xl'

  /** A single order card, located by its order number. */
  card(orderNo) {
    return this.page.locator(this.cardRoot).filter({ hasText: orderNo })
  }

  async queueCount() {
    return this.page.locator(this.cardRoot).count()
  }

  async assertInQueue(orderNo) {
    await expect(this.card(orderNo)).toBeVisible({ timeout: 15000 })
  }

  async assertNotInQueue(orderNo) {
    await expect(this.card(orderNo)).toHaveCount(0, { timeout: 15000 })
  }

  // ── Order actions (scoped to a card) ─────────────────────────────────
  async rejectOrder(orderNo) {
    await this.card(orderNo).getByRole('button', { name: /^reject$/i }).click()
  }

  async fillOtp(code) {
    await this.otpModalTitle.waitFor({ state: 'visible', timeout: 8000 })
    // The 6 boxes auto-advance on each keystroke, so focus the first and type the whole code.
    await this.otpInputs.first().click()
    await this.page.keyboard.type(code, { delay: 40 })
    await expect(this.otpConfirmBtn).toBeEnabled({ timeout: 4000 })
    await this.otpConfirmBtn.click()
    await this.otpModalTitle.waitFor({ state: 'hidden', timeout: 12000 })
  }

  async confirmPickup(orderNo, otp = '123456') {
    await this.card(orderNo).getByRole('button', { name: /confirm pickup/i }).click()
    await this.fillOtp(otp)
  }

  async confirmDelivery(orderNo, otp = '123456') {
    await this.card(orderNo).getByRole('button', { name: /confirm delivery/i }).click()
    await this.fillOtp(otp)
  }

  // ── Shift ────────────────────────────────────────────────────────────
  async setShift(online) {
    const label = online ? /online/i : /offline/i
    const current = (await this.shiftToggle.textContent()) || ''
    const isOnline = /online/i.test(current)
    if (isOnline !== online) {
      await this.shiftToggle.click()
      await expect(this.shiftToggle).toHaveText(label, { timeout: 8000 })
    }
  }

  async refreshOrders() { await this.refreshButton.click() }
}

module.exports = { RiderPage }
