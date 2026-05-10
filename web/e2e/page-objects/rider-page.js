const { expect } = require('@playwright/test')
const { BasePage } = require('./base-page')

/**
 * RiderPage — page object for the rider delivery portal at /rider.
 *
 * Covers:
 *   - Login at /rider/login (WhatsApp phone + PIN)
 *   - Dashboard with current order card
 *   - Accept / Reject buttons for new orders
 *   - Confirm Pickup / Confirm Delivery via OTP modal
 *   - Delivery fee submission after delivery
 *   - Recent deliveries history section
 *
 * Selectors are derived from the actual JSX in:
 *   - app/rider/login/page.jsx
 *   - app/rider/page.jsx
 *   - components/rider/otp-input-modal.jsx
 */
class RiderPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page)

    // ── Login page (/rider/login) ─────────────────────────────────────
    // <Input type="tel" placeholder="+975 17 123 456">
    this.phoneInput = page.getByPlaceholder('+975 17 123 456')
    // <Input type="password" inputMode="numeric" placeholder="Enter your PIN">
    this.pinInput = page.getByPlaceholder('Enter your PIN')
    // <Button type="submit"> "Sign In" or loading "Signing in..."
    this.loginButton = page.getByRole('button', { name: /sign in/i })
    // Error alert inside bg-tibetan container
    this.loginError = page.locator('div.bg-tibetan\\/10 p')

    // ── Dashboard header ───────────────────────────────────────────────
    // Rider name shown in header: <p className="text-sm font-bold">{rider?.name}
    this.riderName = page.locator('header p.text-sm.font-bold')
    // Refresh button: <Button variant="ghost" size="icon" onClick={fetchOrders}>
    this.refreshButton = page.locator('header button').filter({
      has: page.locator('svg.lucide-refresh-cw'),
    })
    // Logout button: <Button variant="ghost" size="icon" onClick={handleSignOut}>
    this.logoutButton = page.locator('header button').filter({
      has: page.locator('svg.lucide-log-out'),
    })

    // ── Stats section ──────────────────────────────────────────────────
    this.deliveredTodayStat = page.getByText('Delivered today')
    this.totalDeliveriesStat = page.getByText('Total deliveries')

    // ── Current order card ─────────────────────────────────────────────
    // "Current Order" header
    this.currentOrderHeader = page.getByText('Current Order')
    // Order number: <p className="text-xs text-muted-foreground font-mono">
    this.orderNoText = page.locator('p.font-mono')
    // Vendor name inside pickup section
    this.vendorNameText = page.locator('div:has(> div:has(svg.lucide-store)) p.text-sm.font-medium')
    // Delivery address text
    this.deliveryAddressText = page.locator(
      'div:has(> div:has(svg.lucide-map-pin)) p.text-sm'
    ).first()
    // Order value: <span className="font-semibold text-primary">Nu. ...
    this.orderValueText = page.locator('span.font-semibold.text-primary')

    // ── Action buttons (visibility depends on order status) ────────────
    // Accept: <Button className="flex-1">Accept Order</Button>
    this.acceptButton = page.getByRole('button', { name: /accept order/i })
    // Reject: <Button variant="outline" className="flex-1">Reject</Button>
    this.rejectButton = page.getByRole('button', { name: /^reject$/i })
    // Confirm Pickup: <Button className="w-full h-11">Confirm Pickup (Enter vendor OTP)
    this.pickupButton = page.getByRole('button', { name: /confirm pickup/i })
    // Confirm Delivery: <Button className="w-full h-11">Confirm Delivery (Enter customer OTP)
    this.deliverButton = page.getByRole('button', { name: /confirm delivery/i })

    // ── OTP modal (shared for pickup + delivery) ───────────────────────
    // The modal title: <h2 className="text-lg font-bold">{title}
    this.otpModalTitle = page.locator('div.fixed.inset-0 h2.text-lg.font-bold')
    // Six single-digit inputs inside: <div className="flex gap-2 justify-center">
    this.otpInputContainer = page.locator('div.fixed.inset-0 div.flex.gap-2.justify-center')
    // Confirm button in modal: <Button type="submit" className="w-full h-12">Confirm</Button>
    this.otpConfirmButton = page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i })
    // Close button (X icon) in modal
    this.otpCloseButton = page.locator('div.fixed.inset-0 button').filter({
      has: page.locator('svg.lucide-x'),
    })
    // OTP error inside the modal
    this.otpError = page.locator('div.fixed.inset-0 div.bg-tibetan\\/10 p')

    // ── Delivery fee form (shown after DELIVERED status) ───────────────
    // <input type="number" placeholder="0.00"> inside fee form
    this.feeInput = page.locator('input[type="number"][placeholder="0.00"]')
    // <Button type="submit" ...>Submit</Button>  (not loading state)
    this.submitFeeButton = page.getByRole('button', { name: /^submit$/i })
    // Fee error text
    this.feeError = page.locator('div:has(> div:has(svg.lucide-dollar-sign)) p.text-tibetan')
    // Fee submitted confirmation: contains "submitted"
    this.feeSubmittedText = page.getByText(/submitted/i)

    // ── Empty state (no active order) ──────────────────────────────────
    this.emptyStateIcon = page.locator('svg.lucide-package').first()
    this.emptyStateText = page.getByText('No active order')

    // ── Recent deliveries section ──────────────────────────────────────
    this.recentDeliveriesHeader = page.getByText('Recent Deliveries')
    this.viewAllLink = page.getByRole('link', { name: /view all/i })
    // Each history row: contains order_no and status badge
    this.historyRows = page.locator('div.space-y-2 > div.flex.items-center.justify-between')
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  /**
   * Navigate to the rider login page and wait for it to render.
   */
  async gotoLogin() {
    await this.navigate('/rider/login')
    // Wait for the login form to be visible (Rider Portal heading or phone input)
    await this.phoneInput.waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Navigate to the rider dashboard.
   */
  async goto() {
    await this.navigate('/rider')
    // Allow the page to finish loading orders
    await this.page.waitForLoadState('networkidle')
  }

  // ── Login ──────────────────────────────────────────────────────────────

  /**
   * Complete the rider login flow: fill phone + PIN, submit, wait for redirect.
   * @param {string} phone - WhatsApp number, e.g. '+97517123456'
   * @param {string} pin - numeric PIN (up to 6 digits)
   * @param {object} [options]
   * @param {number} [options.timeout] - max wait for redirect (default 15 000 ms)
   */
  async login(phone, pin, { timeout = 15000 } = {}) {
    await this.phoneInput.fill(phone)
    await this.pinInput.fill(pin)
    await this.loginButton.click()
    // Wait for redirect from /rider/login to /rider
    await this.page.waitForURL('**/rider', { timeout }).catch(() => {})
  }

  /**
   * Get the login error message text, or null if none visible.
   * @returns {Promise<string|null>}
   */
  async getLoginError() {
    const isVisible = await this.loginError.isVisible({ timeout: 2000 }).catch(() => false)
    if (!isVisible) return null
    return this.loginError.textContent()
  }

  // ── Order actions ──────────────────────────────────────────────────────

  /**
   * Accept the current order.
   */
  async acceptOrder() {
    await this.acceptButton.click()
  }

  /**
   * Reject the current order.
   */
  async rejectOrder() {
    await this.rejectButton.click()
  }

  /**
   * Click the "Confirm Pickup" button to open the OTP modal.
   */
  async openPickupOtpModal() {
    await this.pickupButton.click()
    await this.otpModalTitle.waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Click the "Confirm Delivery" button to open the OTP modal.
   */
  async openDeliveryOtpModal() {
    await this.deliverButton.click()
    await this.otpModalTitle.waitFor({ state: 'visible', timeout: 5000 })
  }

  // ── OTP modal ──────────────────────────────────────────────────────────

  /**
   * Get the six individual OTP digit input locators from the open modal.
   * @returns {Promise<import('@playwright/test').Locator[]>}
   */
  async getOtpInputs() {
    const inputs = []
    for (let i = 0; i < 6; i++) {
      inputs.push(this.otpInputContainer.locator('input').nth(i))
    }
    return inputs
  }

  /**
   * Fill a 6-digit OTP into the modal inputs.
   * @param {string} code - exactly 6 digits
   */
  async fillOtp(code) {
    const inputs = await this.getOtpInputs()
    for (let i = 0; i < 6; i++) {
      await inputs[i].click()
      await inputs[i].pressSequentially(code[i] || '')
    }
  }

  /**
   * Complete the confirm-pickup flow: open modal, fill OTP, submit.
   * @param {string} otp - 6-digit OTP string
   */
  async confirmPickup(otp) {
    await this.openPickupOtpModal()
    await this.fillOtp(otp)
    await this.otpConfirmButton.click()
    // Wait for the modal to close
    await this.otpModalTitle.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  /**
   * Complete the confirm-delivery flow: open modal, fill OTP, submit.
   * @param {string} otp - 6-digit OTP string
   */
  async confirmDelivery(otp) {
    await this.openDeliveryOtpModal()
    await this.fillOtp(otp)
    await this.otpConfirmButton.click()
    // Wait for the modal to close
    await this.otpModalTitle.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  /**
   * Dismiss the OTP modal without submitting.
   */
  async closeOtpModal() {
    await this.otpCloseButton.click()
  }

  /**
   * Get the OTP modal error text, or null if none visible.
   * @returns {Promise<string|null>}
   */
  async getOtpError() {
    const isVisible = await this.otpError.isVisible({ timeout: 2000 }).catch(() => false)
    if (!isVisible) return null
    return this.otpError.textContent()
  }

  // ── Delivery fee ───────────────────────────────────────────────────────

  /**
   * Submit the delivery fee after a completed delivery.
   * @param {number|string} fee - the delivery cost in Ngultrum
   */
  async submitDeliveryFee(fee) {
    await this.feeInput.waitFor({ state: 'visible', timeout: 5000 })
    await this.feeInput.fill(String(fee))
    await this.submitFeeButton.click()
    // Wait for fee confirmation to appear
    await this.feeSubmittedText.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  }

  /**
   * Get the delivery fee error text, or null if none visible.
   * @returns {Promise<string|null>}
   */
  async getFeeError() {
    const isVisible = await this.feeError.isVisible({ timeout: 2000 }).catch(() => false)
    if (!isVisible) return null
    return this.feeError.textContent()
  }

  // ── Assertions ─────────────────────────────────────────────────────────

  /**
   * Assert that the current order card is visible on the dashboard.
   */
  async assertOrderVisible() {
    await expect(this.currentOrderHeader).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the empty state (no active order) is showing.
   */
  async assertEmptyState() {
    await expect(this.emptyStateText).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the accept button is visible (order is in CONFIRMED/PROCESSING state).
   */
  async assertCanAccept() {
    await expect(this.acceptButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that the confirm-pickup button is visible (order has pickup OTP assigned).
   */
  async assertCanPickup() {
    await expect(this.pickupButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that the confirm-delivery button is visible (order is DISPATCHED).
   */
  async assertCanDeliver() {
    await expect(this.deliverButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that the delivery fee form is visible (order is DELIVERED).
   */
  async assertCanSubmitFee() {
    await expect(this.feeInput).toBeVisible({ timeout: 5000 })
  }

  /**
   * Get the order number from the current order card.
   * @returns {Promise<string>}
   */
  async getOrderNo() {
    return this.orderNoText.textContent()
  }

  /**
   * Get the number of recent delivery rows shown.
   * @returns {Promise<number>}
   */
  async getHistoryCount() {
    return this.historyRows.count()
  }

  /**
   * Click the refresh button to re-fetch orders.
   */
  async refreshOrders() {
    await this.refreshButton.click()
  }

  /**
   * Log out from the rider portal.
   */
  async logout() {
    await this.logoutButton.click()
    await this.page.waitForURL('**/rider/login', { timeout: 10000 }).catch(() => {})
  }
}

module.exports = { RiderPage }
