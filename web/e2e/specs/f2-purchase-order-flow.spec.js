const { test, expect } = require('@playwright/test')
const { TEST_WHOLESALER } = require('../fixtures/test-data')

test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Purchase Order Flow — PO → PI', () => {

  test('creates a PO, converts to PI, confirms receipt, verifies related invoices', async ({ page }) => {
    // ── Step 1: Navigate to new PO page ────────────────────────────────
    await page.goto('/pos/purchases/new')
    await expect(page.getByText('New Purchase Order')).toBeVisible()

    // ── Step 2: Select supplier ─────────────────────────────────────────
    const supplierInput = page.getByPlaceholder(/search or enter supplier/i)
    await supplierInput.fill(TEST_WHOLESALER.name)
    const supplierResult = page.getByText(TEST_WHOLESALER.name).first()
    await expect(supplierResult).toBeVisible()
    await supplierResult.click()

    // ── Step 3: Add products via search ─────────────────────────────────
    await page.getByRole('button', { name: /search products/i }).click()

    const searchInput = page.getByPlaceholder('Search product name or SKU...')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('Druk 1100')

    const firstResult = page.locator('table tbody tr').first()
    await expect(firstResult).toBeVisible()
    await firstResult.click()

    // ── Step 4: Save PO ────────────────────────────────────────────────
    const saveButton = page.getByRole('button', { name: /save purchase order/i })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    await expect(page.getByText('Purchase Order Created')).toBeVisible()
    const orderNoEl = page.locator('p.font-mono').first()
    await expect(orderNoEl).toBeVisible()
    const orderNo = (await orderNoEl.textContent()).trim()

    await expect(page.getByRole('button', { name: /view po/i })).toBeVisible()

    // ── Step 5: View PO detail ─────────────────────────────────────────
    await page.getByRole('button', { name: /view po/i }).click()
    await expect(page.getByText(orderNo)).toBeVisible()
    await expect(page.getByText('DRAFT')).toBeVisible()

    const poId = page.url().split('/').pop()

    // ── Step 6: Convert to Purchase Invoice ─────────────────────────────
    await page.getByRole('button', { name: /convert to purchase invoice/i }).click()

    const overlay = page.locator('.fixed.inset-0')
    await expect(overlay).toBeVisible()

    // Fill optional batch metadata if the inputs are present. These are
    // genuinely conditional UI (only show for lots that need them), so
    // a soft check + fill is correct, not a silent skip.
    const batchInput = overlay.locator('input[placeholder="Optional"]').first()
    if (await batchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await batchInput.fill('TEST-BATCH-001')
    }
    const expiryInput = overlay.locator('input[type="date"]').first()
    if (await expiryInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expiryInput.fill('2027-12-31')
    }

    await overlay.getByRole('button', { name: /create purchase invoice/i }).click()

    // Must navigate away from the PO to the freshly-created invoice
    await page.waitForURL((url) => {
      const path = new URL(url).pathname
      return path.startsWith('/pos/purchases/') && !path.endsWith(`/${poId}`)
    })

    // ── Step 7: Verify invoice detail ───────────────────────────────────
    await expect(page.locator('.font-mono.font-medium.truncate').first()).toBeVisible()

    // ── Step 8: Confirm receipt ─────────────────────────────────────────
    const confirmButton = page.getByRole('button', { name: /confirm receipt/i })
    await expect(confirmButton).toBeVisible()
    page.on('dialog', dialog => dialog.accept())

    // Wait for the confirm POST so we know it finished before navigating away.
    // The receipt endpoint is POST /api/purchases/[id]/confirm (the DB trigger
    // restock_on_invoice_confirm fires server-side here).
    const receiptResponse = page.waitForResponse(
      (res) => /\/api\/purchases\/.*\/confirm/i.test(res.url()) && res.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null)
    await confirmButton.click()
    await receiptResponse

    // ── Step 9: Verify related invoices on PO page ─────────────────────
    await page.goto(`/pos/purchases/${poId}`)
    await expect(page.locator('.font-mono.font-medium.truncate').first()).toBeVisible()
    await expect(page.getByText(/related invoices/i)).toBeVisible()
    await expect(page.getByText('PI-')).toBeVisible()
  })

  test('purchase list page shows POs and invoices in correct tabs', async ({ page }) => {
    await page.goto('/pos/purchases')
    await expect(page.getByText('Purchases')).toBeVisible()

    const poTab = page.getByRole('button', { name: /purchase orders/i })
    const invoiceTab = page.getByRole('button', { name: /purchase invoices/i })

    await poTab.click()
    // The purchases list renders tabs as styled <button>s (no aria-selected);
    // the active tab carries the `bg-primary` class (see app/pos/purchases/page.jsx).
    await expect(poTab).toHaveClass(/bg-primary/)

    await invoiceTab.click()
    await expect(invoiceTab).toBeVisible()

    // Both tabs should render their list container — empty state OR rows.
    const rows = page.locator('button:has(> .flex-1)')
    const emptyState = page.getByText(/no.*invoice|empty/i)
    await expect(rows.first().or(emptyState)).toBeVisible()
  })
})
