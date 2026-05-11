const { expect } = require('@playwright/test')
const { BasePage } = require('./base-page')

/**
 * TouchPosPage — page object for the touch-friendly POS at /pos/touch.
 *
 * Covers:
 *   - Product grid with searchable cards
 *   - Product detail modal (click card opens modal, then "Add to Cart")
 *   - Cart panel with item rows, quantity +/- controls
 *   - GST breakdown (subtotal, discount, taxable, GST 5%, total)
 *   - Payment method selector (mBoB, mPay, Cash, RTGS, Credit)
 *   - Checkout button (triggers customer identification modal if needed)
 *   - Customer identification modal (WhatsApp number entry)
 *   - Multi-cart tab bar
 *
 * Selectors are derived from the actual JSX in:
 *   - app/pos/touch/page.jsx
 *   - components/pos/product-panel.jsx
 *   - components/pos/product-detail-modal.jsx
 *   - components/pos/cart-panel.jsx
 *   - components/pos/customer-id-modal.jsx
 */
class TouchPosPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page)

    // ── Loading state ──────────────────────────────────────────────────
    // "Loading POS..." text shown while entity data loads
    this.loadingText = page.getByText('Loading POS...')

    // ── Product panel (left side) ──────────────────────────────────────
    // Search bar: <Input placeholder="Search products by name or SKU...">
    this.productSearchInput = page.getByPlaceholder('Search products by name or SKU...')
    // Product grid: contains ProductCard buttons
    this.productGrid = page.locator('div.grid.grid-cols-2')
    // Individual product cards: <button> with product name text inside
    this.productCards = page.locator('div.grid.grid-cols-2 > button')
    // No products empty state
    this.noProductsText = page.getByText('No products found')
    // Camera toggle button
    this.cameraToggleButton = page.getByText(/camera on|camera off/i)

    // ── Product detail modal ───────────────────────────────────────────
    // Opened when a product card is clicked. Uses shadcn Dialog.
    this.productModal = page.locator('div[role="dialog"]')
    this.productModalTitle = this.productModal.getByText('Product Details')
    // "Add to Cart" button inside the modal
    this.addToCartButton = this.productModal.getByRole('button', { name: /add to cart/i })
    // "Close" button in the modal
    this.closeProductModalButton = this.productModal.getByRole('button', { name: /^close$/i })

    // ── Cart panel (right side) ────────────────────────────────────────
    // Empty cart state
    this.emptyCartText = page.getByText('Cart is empty')
    // Cart items: each item is a bordered card
    this.cartItems = page.locator('div.flex.flex-col.gap-1\\.5.p-2\\.5.rounded-lg.border')
    // Individual cart item by product name
    // Quantity controls for a specific cart item row
    // The qty display: <span className="text-sm font-medium w-6 text-center tabular-nums">

    // ── Multi-cart tab bar ─────────────────────────────────────────────
    // Cart tabs: "Cart 1", "Cart 2", etc.
    this.cartTabs = page.locator('div.flex.items-center button:has(svg.lucide-shopping-cart)')
    // Hold/add new cart button (PlusCircle icon)
    this.holdCartButton = page.locator('button:has(svg.lucide-plus-circle)')

    // ── Totals section ─────────────────────────────────────────────────
    // Subtotal line: "Subtotal (pre-discount)"
    this.subtotalText = page.getByText('Subtotal (pre-discount)')
    // Discount line (only visible when discount applied)
    this.discountText = page.getByText('Discount')
    // Taxable amount line
    this.taxableText = page.getByText('Taxable amount')
    // GST line
    this.gstText = page.getByText(/GST @ 5%/i)
    // Total line (bold, at bottom of totals)
    this.totalLabel = page.getByText('Total', { exact: true })

    // ── Payment method buttons ─────────────────────────────────────────
    // Grid of 3 payment buttons: Online, Cash, Credit
    this.paymentMethodSection = page.getByText('Payment Method')
    this.onlineButton = page.getByRole('button', { name: /^online$/i })
    this.cashButton = page.getByRole('button', { name: /^cash$/i })
    this.creditButton = page.getByRole('button', { name: /^credit$/i })

    // Journal number input (visible when Online selected)
    this.journalInput = page.locator('input[placeholder="Enter journal number"]')

    // ── Checkout button ────────────────────────────────────────────────
    // Text is "Select Payment Method" when none chosen, or "Charge Nu. X.XX"
    this.checkoutButton = page.getByRole('button', { name: /charge nu\.|select payment method|processing/i })
    // Customer ID required warning
    this.customerRequiredWarning = page.getByText(/customer id required/i)

    // ── Customer identification modal ──────────────────────────────────
    // Dialog with "Identify Customer" title
    this.customerModal = page.locator('div[role="dialog"]')
    this.customerModalTitle = page.getByText('Identify Customer')
    // WhatsApp phone input inside the modal
    this.customerPhoneInput = page.locator('div[role="dialog"]').getByPlaceholder('+975 17 123 456')
    // "Confirm Customer" submit button
    this.confirmCustomerButton = page.locator('div[role="dialog"]').getByRole('button', { name: /confirm customer/i })
    // "Cancel" button in the customer modal
    this.cancelCustomerButton = page.locator('div[role="dialog"]').getByRole('button', { name: /^cancel$/i })

    // ── Checkout error ─────────────────────────────────────────────────
    this.checkoutError = page.locator('div.bg-tibetan\\/10 p')
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  /**
   * Navigate to the touch POS page and wait for products to load.
   */
  async goto() {
    await this.navigate('/pos/touch')
    // Wait for POS to fully load (entity resolved, products fetched)
    // Either products appear or the loading spinner disappears
    await this.page.waitForLoadState('networkidle')
    // Wait for the product grid or the empty state to be visible
    const hasProducts = await this.productGrid.isVisible({ timeout: 15000 }).catch(() => false)
    if (!hasProducts) {
      await expect(this.noProductsText).toBeVisible({ timeout: 3000 })
    }
  }

  /**
   * Assert the POS has fully loaded (no loading spinner, product grid visible).
   */
  async assertLoaded() {
    await expect(this.loadingText).not.toBeVisible()
    await expect(this.productSearchInput).toBeVisible({ timeout: 10000 })
  }

  // ── Product selection ──────────────────────────────────────────────────

  /**
   * Search for products by name or SKU.
   * @param {string} query - search text
   */
  async searchProducts(query) {
    await this.productSearchInput.fill(query)
    // Wait for filtered results to settle
    await this.page.waitForTimeout(300)
  }

  /**
   * Get the number of visible product cards in the grid.
   * @returns {Promise<number>}
   */
  async getProductCount() {
    return this.productCards.count()
  }

  /**
   * Add a product by its name. Clicks the product card to open the detail
   * modal, then clicks "Add to Cart".
   * @param {string} name - full or partial product name
   */
  async addProductByName(name) {
    // Find the product card containing the name and click it
    const card = this.productCards.filter({ hasText: name }).first()
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.click()
    // Wait for the product detail modal to appear
    await expect(this.addToCartButton).toBeVisible({ timeout: 5000 })
    await this.addToCartButton.click()
    // Wait for the modal to close
    await expect(this.addToCartButton).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Get a locator for a specific cart item row by product name.
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  getCartItem(name) {
    return this.cartItems.filter({ hasText: name }).first()
  }

  /**
   * Get the quantity display for a cart item.
   * @param {string} name - product name in the cart
   * @returns {Promise<string>}
   */
  async getCartitemQty(name) {
    const item = this.getCartItem(name)
    const qtySpan = item.locator('span.text-sm.font-medium.w-6')
    return qtySpan.textContent()
  }

  /**
   * Set the exact quantity for a cart item by clicking +/- buttons.
   * If current qty is 2 and target is 5, clicks + three times.
   * If current qty is 5 and target is 2, clicks - three times.
   * @param {string} name - product name
   * @param {number} qty - desired quantity
   */
  async setQuantity(name, qty) {
    const item = this.getCartItem(name)
    // Minus button: <button> with svg.lucide-minus
    const minusBtn = item.locator('button:has(svg.lucide-minus)')
    // Plus button: <button> with svg.lucide-plus
    const plusBtn = item.locator('button:has(svg.lucide-plus)')

    // Read current qty
    let current = parseInt(await this.getCartitemQty(name), 10)

    // Increase quantity
    while (current < qty) {
      await plusBtn.click()
      current++
    }

    // Decrease quantity
    while (current > qty) {
      await minusBtn.click()
      current--
    }
  }

  /**
   * Remove a cart item entirely by clicking the trash icon.
   * @param {string} name - product name to remove
   */
  async removeCartItem(name) {
    const item = this.getCartItem(name)
    const trashBtn = item.locator('button:has(svg.lucide-trash-2)')
    await trashBtn.click()
  }

  // ── Cart totals ────────────────────────────────────────────────────────

  /**
   * Get the subtotal amount (pre-discount) shown in the totals section.
   * Parses the "Nu. XX.XX" text after the "Subtotal (pre-discount)" label.
   * @returns {Promise<number>}
   */
  async getSubtotal() {
    const row = this.page.locator('div.flex.justify-between').filter({ hasText: 'Subtotal (pre-discount)' })
    const text = await row.locator('span').last().textContent()
    return parseFloat(text.replace('Nu. ', ''))
  }

  /**
   * Get the GST amount shown in the totals section.
   * @returns {Promise<number>}
   */
  async getGstTotal() {
    const row = this.page.locator('div.flex.justify-between').filter({ hasText: /GST @ 5%/ })
    const text = await row.locator('span').last().textContent()
    return parseFloat(text.replace('Nu. ', ''))
  }

  /**
   * Get the grand total amount shown at the bottom of the totals section.
   * The total row has a "Total" label and a primary-colored "Nu. XX.XX" span.
   * @returns {Promise<number>}
   */
  async getCartTotal() {
    // The total row: "Total" in one span, "Nu. XX.XX" in a span with class text-primary
    const totalRow = this.page.locator('div.flex.justify-between.font-bold.text-base')
    const totalSpan = totalRow.locator('span.text-primary')
    const text = await totalSpan.textContent()
    return parseFloat(text.replace('Nu. ', ''))
  }

  /**
   * Get all totals as a structured object.
   * @returns {Promise<{ subtotal: number, gst: number, total: number }>}
   */
  async getTotals() {
    // Read each value from the displayed text. Use regex to extract Nu. amounts.
    const subtotalRow = this.page.locator('div.flex.justify-between').filter({ hasText: 'Subtotal (pre-discount)' })
    const gstRow = this.page.locator('div.flex.justify-between').filter({ hasText: /GST @ 5%/ })
    const totalRow = this.page.locator('div.flex.justify-between.font-bold.text-base')

    const parseNu = async (locator) => {
      const text = await locator.locator('span').last().textContent()
      return parseFloat(text.replace(/[^\d.]/g, ''))
    }

    return {
      subtotal: await parseNu(subtotalRow),
      gst: await parseNu(gstRow),
      total: await parseNu(totalRow),
    }
  }

  // ── Payment method ─────────────────────────────────────────────────────

  /**
   * Select a payment method.
   * @param {'ONLINE'|'CASH'|'CREDIT'} method
   */
  async selectPaymentMethod(method) {
    const buttonMap = {
      ONLINE: this.onlineButton,
      CASH: this.cashButton,
      CREDIT: this.creditButton,
    }
    const btn = buttonMap[method]
    if (!btn) throw new Error(`Unknown payment method: ${method}`)
    await btn.click()
  }

  /**
   * Fill the journal number input (visible when Online selected).
   */
  async fillJournalNumber(ref) {
    await this.journalInput.fill(ref)
  }

  /**
   * Assert the journal number input is visible.
   */
  async assertJournalNumberVisible() {
    await expect(this.journalInput).toBeVisible()
  }

  // ── Checkout ───────────────────────────────────────────────────────────

  /**
   * Identify a customer by WhatsApp number via the customer modal.
   * This is called automatically if no customer is set when checkout is clicked.
   * @param {string} whatsapp - E.164 phone number, e.g. '+97517123456'
   */
  async identifyCustomer(whatsapp) {
    await expect(this.customerModalTitle).toBeVisible({ timeout: 5000 })
    await this.customerPhoneInput.fill(whatsapp)
    await this.confirmCustomerButton.click()
    // Wait for the modal to close
    await expect(this.customerModalTitle).not.toBeVisible({ timeout: 10000 })
  }

  /**
   * Complete the full checkout flow: select payment, optionally identify customer, click checkout.
   * @param {'MBOB'|'MPAY'|'CASH'|'RTGS'|'CREDIT'} paymentMethod
   * @param {object} [options]
   * @param {string} [options.customerPhone] - WhatsApp number if customer ID is required
   * @param {number} [options.timeout] - max wait for order redirect (default 30 000 ms)
   */
  async checkout(paymentMethod, { customerPhone, timeout = 30000 } = {}) {
    await this.selectPaymentMethod(paymentMethod)
    await this.checkoutButton.click()

    // Handle customer identification modal if it appears
    const modalVisible = await this.customerModalTitle.isVisible({ timeout: 3000 }).catch(() => false)
    if (modalVisible && customerPhone) {
      await this.identifyCustomer(customerPhone)
    }

    // Wait for redirect to order confirmation page
    await this.page.waitForURL('**/pos/order/**', { timeout })
  }

  // ── Multi-cart ─────────────────────────────────────────────────────────

  /**
   * Hold the current cart and start a new one.
   */
  async holdCart() {
    await this.holdCartButton.click()
  }

  /**
   * Switch to a specific cart tab by index (0-based).
   * @param {number} index
   */
  async switchCart(index) {
    const tab = this.cartTabs.nth(index)
    await tab.click()
  }

  /**
   * Get the number of cart tabs visible.
   * @returns {Promise<number>}
   */
  async getCartTabCount() {
    return this.cartTabs.count()
  }

  // ── Assertions ─────────────────────────────────────────────────────────

  /**
   * Assert that a product exists in the grid by name.
   * @param {string} name
   */
  async assertProductVisible(name) {
    const card = this.productCards.filter({ hasText: name }).first()
    await expect(card).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a product has been added to the cart.
   * @param {string} name
   */
  async assertItemInCart(name) {
    const item = this.getCartItem(name)
    await expect(item).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert the cart is empty.
   */
  async assertCartEmpty() {
    await expect(this.emptyCartText).toBeVisible()
  }

  /**
   * Assert the checkout button shows a specific payment charge amount.
   * @param {number} amount
   */
  async assertCheckoutAmount(amount) {
    const btnText = `Charge Nu. ${amount.toFixed(2)}`
    await expect(this.checkoutButton).toHaveText(new RegExp(btnText.replace('.', '\\.')), { timeout: 5000 })
  }

  /**
   * Assert that a checkout error is visible.
   * @param {string|RegExp} [errorPattern] - optional pattern to match error text
   */
  async assertCheckoutError(errorPattern) {
    if (errorPattern) {
      await expect(this.checkoutError).toContainText(errorPattern, { timeout: 5000 })
    } else {
      await expect(this.checkoutError).toBeVisible({ timeout: 5000 })
    }
  }
}

module.exports = { TouchPosPage }
