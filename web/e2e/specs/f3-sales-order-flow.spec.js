const { test, expect } = require('@playwright/test')
const { TEST_PRODUCTS } = require('../fixtures/test-data')
const { SalesOrderPage } = require('../page-objects/sales-order-page')

test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Sales Order Flow — SO → SI', () => {

  test('creates a SO, converts to SI, verifies order and invoice', async ({ page }) => {
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
    const viewInvoiceBtn = page.getByRole('button', { name: /view invoice/i })
    await expect(viewInvoiceBtn).toBeVisible()
    await viewInvoiceBtn.click()

    // ── Step 8: Verify invoice detail page ─────────────────────────────
    await page.waitForURL((url) => {
      const path = new URL(url).pathname
      return path.startsWith('/pos/') && !path.endsWith(`/${soId}`)
    })
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
