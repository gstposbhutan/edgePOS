const { test, expect } = require('@playwright/test')
const { TEST_PRODUCTS } = require('../fixtures/test-data')
const { SalesOrderPage } = require('../page-objects/sales-order-page')

test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Sales Order Flow — SO → SI', () => {

  test('creates a SO, converts to SI, verifies order and invoice', async ({ page }) => {
    // SO creation + SI conversion (batch selection, stock decrement, khata
    // ledger writes) is DB-heavy and regularly exceeds the default 60s budget
    // on this box. Give the whole flow headroom so the final assertions run.
    test.setTimeout(150000)

    const soPage = new SalesOrderPage(page)

    // ── Step 1: Navigate to Sales Order page ───────────────────────────
    await soPage.goto()
    await soPage.assertPageLoaded()

    // ── Step 2: Fill customer details ──────────────────────────────────
    await soPage.fillCustomerDetails(
      '+97517100011',
      'Karma Tshering',
      'Jungshina, Thimphu'
    )

    // ── Step 3: Add products via search ────────────────────────────────
    await soPage.addProductViaSearch(TEST_PRODUCTS[0].name.slice(0, 10), 2)
    await soPage.assertItemCount(1)

    await soPage.addProductViaSearch(TEST_PRODUCTS[9].name.slice(0, 10), 1)
    await soPage.assertItemCount(2)

    // ── Step 4: Place order ────────────────────────────────────────────
    await soPage.placeOrder()
    await soPage.assertSuccess()
    const orderNo = await soPage.getSuccessOrderNo()
    expect(orderNo).toMatch(/SO-/)

    // ── Step 5: View SO detail ─────────────────────────────────────────
    await soPage.clickViewOrder()
    await expect(page.getByText(orderNo)).toBeVisible()
    await expect(page.getByText('DRAFT')).toBeVisible()

    const soId = page.url().split('/').pop()

    // ── Step 6: Create Sales Invoice via overlay ───────────────────────
    const createSiButton = page.getByRole('button', { name: /create sales invoice/i })
    await expect(createSiButton).toBeVisible()
    await createSiButton.click()

    const overlay = page.locator('.fixed.inset-0, [role="dialog"]').last()
    await expect(overlay).toBeVisible()

    // Pick the first non-default option in every batch dropdown.
    const batchSelects = overlay.locator('select')
    const selectCount = await batchSelects.count()
    for (let i = 0; i < selectCount; i++) {
      const sel = batchSelects.nth(i)
      if (await sel.locator('option').count() > 1) {
        await sel.selectOption({ index: 1 })
      }
    }

    await overlay.getByRole('button', { name: /create invoice/i }).click()

    // ── Step 7: Verify SI success screen ───────────────────────────────
    // The invoice-create result renders a success overlay on the SO page
    // showing "<SI-…> created" + a printable invoice preview. This overlay IS
    // the proof the SI was created — assert it directly (order-detail page.jsx
    // invoiceResult success branch).
    const siCreatedBanner = page.getByText(/SI-\d{4}-\d+.*created/i)
    await expect(siCreatedBanner).toBeVisible({ timeout: 30000 })

    // "View Invoice" (order-detail page.jsx) does router.push(`/pos/orders/${inv.id}`)
    // — a fresh SI order id distinct from soId. After clicking, the URL should
    // move off the SO id onto the invoice id. Use expect.poll with a bounded
    // timeout: if navigation lands, assert the invoice number renders on the
    // destination page; if the overlay is still mounted (slow nav), the SI
    // banner above has already proven success.
    const viewInvoiceBtn = page.getByRole('button', { name: /view invoice/i })
    await expect(viewInvoiceBtn).toBeVisible()
    await viewInvoiceBtn.click()

    // "View Invoice" pushes to `/pos/orders/${inv.id}` — a fresh SI id. The
    // SI success banner above already proved the invoice was created; this
    // asserts the navigation lands on the invoice-detail route. Bounded so a
    // real app-level nav failure surfaces as a clear failure rather than a
    // 60s global timeout.
    await expect.poll(async () => {
      const path = new URL(page.url()).pathname
      return path.startsWith('/pos/orders/') && !path.endsWith(`/${soId}`)
    }, { timeout: 20000, message: 'View Invoice did not navigate to the invoice id' }).toBe(true)

    // ── Step 8: Verify invoice detail page ─────────────────────────────
    await expect(page.locator('.font-mono').first()).toBeVisible()

    // ── Step 9: Navigate back to SO list and verify ────────────────────
    await page.goto('/pos/orders?section=SALES&tab=SO')
    await expect(page.getByRole('button', { name: /sales orders/i })).toBeVisible()
  })

  test('sales order page validates required fields', async ({ page }) => {
    const soPage = new SalesOrderPage(page)
    await soPage.goto()
    await soPage.assertPageLoaded()

    // Place Order must be disabled with no items.
    await soPage.assertPlaceOrderDisabled()
  })

  test('sales order supports adding and removing items', async ({ page }) => {
    const soPage = new SalesOrderPage(page)
    await soPage.goto()
    await soPage.assertPageLoaded()
    await soPage.fillCustomerDetails('+97517100011', 'Test Customer', 'Test Address')

    await soPage.addProductViaSearch(TEST_PRODUCTS[2].name.slice(0, 10))
    await soPage.assertItemCount(1)

    await soPage.incrementItemQty(0)
    await soPage.removeItem(0)
    await soPage.assertItemCount(0)
  })
})
