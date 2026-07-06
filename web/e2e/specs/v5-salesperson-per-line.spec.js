const { test, expect } = require('@playwright/test')
const { clearCart } = require('./v2-helpers')

// #3 salesperson attribution PER LINE, and #4 rate tier PER LINE. Both share the cart merge key:
// the same SKU can appear as two lines when the salesperson OR the rate differs.
test.describe('Per-line salesperson + rate', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test.beforeEach(async ({ page }) => {
    await clearCart()
    await page.goto('/pos')
    await expect(page.getByText('New Sale').or(page.getByText('Tender')).first()).toBeVisible({ timeout: 15000 })
    await page.locator('body').click({ position: { x: 4, y: 4 } })
  })

  async function openSearch(page, query) {
    // Blur any focused cart input, then open search with F3 (robust across re-renders) and type.
    await page.locator('body').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('F3')
    const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
    await expect(modal).toBeVisible()
    await page.locator('[data-testid="keyboard-product-search-input"]').fill(query)
    await expect(modal.locator('table tbody tr').first()).toBeVisible()
    return modal
  }

  test('#3 F8 assigns a salesperson to the selected product line', async ({ page }) => {
    // Add a product first — the new line becomes the selected row.
    const modal = await openSearch(page, 'Druk')
    await modal.locator('table tbody tr').first().click()
    await expect(modal).not.toBeVisible()
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible()

    // F8 assigns a salesperson to THAT selected line (per-product, not invoice-level).
    await page.keyboard.press('F8')
    await expect(page.getByText('Select Sales Person')).toBeVisible()
    await page.locator('[data-testid="salesperson-option"]').filter({ hasText: 'Cashier' }).click({ force: true })
    await expect(page.getByText('Select Sales Person')).not.toBeVisible()

    // The line now carries that salesperson's label.
    await expect(firstRow.getByText('Cashier')).toBeVisible()
    console.log('SALESPERSON_PER_LINE_OK')
  })

  test('#4 same item at two rates makes two lines', async ({ page }) => {
    // Line 1: Druk 1100 Generator at RETAIL (default).
    let modal = await openSearch(page, 'Druk')
    await modal.locator('table tbody tr').first().click()
    await expect(modal).not.toBeVisible()
    await expect(page.locator('table tbody tr')).toHaveCount(1)

    // Line 2: same product at WHOLESALE via the search rate toggle → a SEPARATE line.
    modal = await openSearch(page, 'Druk')
    await modal.getByRole('button', { name: 'Wholesale' }).click()
    await modal.locator('table tbody tr').first().click()
    await expect(modal).not.toBeVisible()

    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(2)
    const texts = await rows.allInnerTexts()
    // Same product added twice at two tiers → two lines with DIFFERENT unit prices.
    const unitPrices = texts.map(t => (t.match(/Nu\. ([\d,]+\.\d{2})/) || [])[1])
    console.log('UNIT_PRICES', JSON.stringify(unitPrices))
    expect(unitPrices[0]).toBeTruthy()
    expect(unitPrices[1]).toBeTruthy()
    expect(unitPrices[0]).not.toBe(unitPrices[1])   // retail line ≠ wholesale line
    console.log('TWO_RATES_TWO_LINES_OK')
  })
})
