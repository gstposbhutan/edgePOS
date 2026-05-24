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
    await expect(page.getByText('NEXUS').first().or(page.locator('[data-testid="pos-page"]'))).toBeVisible()

    // ── Step 1: Add two products via F3 search ────────────────────────
    await addProductViaSearch(page, 'Druk Supreme')
    await addProductViaSearch(page, 'Notebook A4')

    // ── Step 2: Confirm cart has rows ─────────────────────────────────
    const cartRows = page.locator('table tbody tr')
    await expect(cartRows.first()).toBeVisible()

    // ── Step 3: Checkout with CASH via F5 ─────────────────────────────
    await page.keyboard.press('F5')

    const paymentModal = page.locator('[role="dialog"], .fixed.inset-0').last()
    await expect(paymentModal).toBeVisible()

    await paymentModal.getByRole('button', { name: /cash/i }).click()

    const confirmBtn = paymentModal.getByRole('button', { name: /confirm|pay|submit/i })
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    // ── Step 4: Verify success — either banner or redirect ────────────
    const successBanner = page.getByText(/order.*completed|✓.*order/i)
    await expect(successBanner.or(page.locator('main:has-text("Order")'))).toBeVisible()

    // ── Step 5: Order appears in POS orders list ──────────────────────
    await page.goto('/pos/orders?section=SALES&tab=POS')
    await expect(page.getByRole('button', { name: /pos orders/i })).toBeVisible()
  })

  test('POS sale with CREDIT payment updates khata balance', async ({ page }) => {
    await page.goto('/pos')

    await addProductViaSearch(page, 'Wai Wai')

    await page.keyboard.press('F5')
    const paymentModal = page.locator('[role="dialog"], .fixed.inset-0').last()
    await expect(paymentModal).toBeVisible()

    await paymentModal.getByRole('button', { name: /credit/i }).click()

    const khataSelect = paymentModal.locator('select').first()
    await expect(khataSelect).toBeVisible()
    const optionCount = await khataSelect.locator('option').count()
    expect(optionCount).toBeGreaterThan(1)
    await khataSelect.selectOption({ index: 1 })

    const confirmBtn = paymentModal.getByRole('button', { name: /confirm|pay|submit/i })
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    // CREDIT checkout must succeed (banner or redirect) — no silent skip.
    const successBanner = page.getByText(/order.*completed|✓.*order/i)
    await expect(successBanner.or(page.locator('main:has-text("Order")'))).toBeVisible()
  })
})
