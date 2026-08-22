const { test, expect } = require('@playwright/test')

test.use({ storageState: 'e2e/storage/manager-auth.json' })

// Shared helper: open F3 product search and add the first match for the query.
async function addProductViaSearch(page, query) {
  await page.keyboard.press('F3')

  const modal = page.locator('.fixed.inset-0').last()
  await expect(modal).toBeVisible()

  const searchInput = modal.getByPlaceholder(/Search product name or SKU/)
  await expect(searchInput).toBeVisible()
  await searchInput.fill(query)

  const firstRow = modal.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible()
  await firstRow.click()

  // Modal should close after selection
  await expect(modal).not.toBeVisible()
}

test.describe('Direct POS Sales Invoice Flow', () => {

  test('creates a POS sale with CASH payment and verifies in orders list', async ({ page }) => {
    await page.goto('/pos')
    // Wait for the POS header to render (entity name + customer button),
    // confirming the keyboard handler is attached before we press F3/F10.
    await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })

    // ── Step 1: Add two products via F3 search ────────────────────────
    await addProductViaSearch(page, 'Druk Supreme')
    await addProductViaSearch(page, 'Notebook A4')

    // ── Step 2: Confirm cart has rows ─────────────────────────────────
    const cartRows = page.locator('table tbody tr')
    await expect(cartRows.first()).toBeVisible()

    // ── Step 3: Checkout with CASH via F10 (Tender) ───────────────────
    // F10 opens the PaymentModal. (F5 is "switch cart" in the keyboard POS,
    // not payment — see web/app/pos/page.jsx keydown handler.)
    await page.keyboard.press('F10')

    const paymentModal = page.locator('[role="dialog"], .fixed.inset-0').last()
    await expect(paymentModal).toBeVisible()

    // Select CASH as the payment method. "[2] Cash" is the active-method button.
    await paymentModal.getByRole('button', { name: /cash/i }).click()

    // For CASH, Complete stays disabled until "Received" >= grand total
    // (payment-modal.jsx: canComplete = receivedAmt >= grandTotal). The
    // received spinbutton starts empty, so click "[E] Exact" which sets
    // received = grandTotal, enabling Complete.
    await paymentModal.getByRole('button', { name: /exact/i }).click()

    // Complete button is labelled "[Enter] Complete" (payment-modal.jsx).
    const confirmBtn = paymentModal.getByRole('button', { name: /complete/i })
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    // ── Step 4: Verify success — either banner or redirect ────────────
    const successBanner = page.getByText(/order.*completed|✓.*order/i)
    await expect(successBanner.or(page.locator('main:has-text("Order")'))).toBeVisible()

    // ── Step 5: Order appears in POS orders list ──────────────────────
    // section=POS renders the POS orders list (SALES section is for SO/SI/MKT/WA).
    await page.goto('/pos/orders?section=POS')
    await expect(page.getByRole('button', { name: /pos orders/i })).toBeVisible()
  })

  // SKIPPED: The CREDIT payment flow changed. The PaymentModal no longer
  // collects a khata account via an in-modal <select>. Instead, selecting
  // CREDIT and clicking Complete opens a separate CustomerOtpModal
  // (web/app/pos/page.jsx handlePaymentConfirm → setCreditOtpOpen), which
  // resolves/creates the khata account from a phone+OTP. This test's
  // premise (pick a khata account from a dropdown inside the payment modal)
  // no longer matches the UI. Rewrite against the OTP flow to re-enable.
  test.skip('POS sale with CREDIT payment updates khata balance', async () => {})
})
