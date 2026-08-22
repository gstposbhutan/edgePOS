const { test, expect } = require('@playwright/test')
const { clearCart } = require('./v2-helpers')

// #1 weighed-goods parity on web: adding a sold_by_weight product opens a weigh modal; the entered
// weight becomes the line's fractional quantity and the total = weight × per-unit rate.
test.describe('Weighed goods', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test.beforeEach(async ({ page }) => {
    await clearCart()
    await page.goto('/pos')
    await expect(page.getByText('New Sale').or(page.getByText('Tender')).first()).toBeVisible({ timeout: 15000 })
    await page.locator('body').click({ position: { x: 4, y: 4 } })
  })

  test('weigh modal sets a fractional quantity + weight-based total', async ({ page }) => {
    // Open search, find the weighed product, add it → weigh modal opens.
    await page.keyboard.press('F3')
    const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
    await expect(modal).toBeVisible()
    await page.locator('[data-testid="keyboard-product-search-input"]').fill('11000 Bottle')
    await expect(modal.locator('table tbody tr').first()).toBeVisible()
    await modal.locator('table tbody tr').first().click()

    // Weigh modal (rate Nu. 65/unit).
    await expect(page.getByText(/Weigh —/)).toBeVisible()
    await page.getByRole('spinbutton').fill('2')
    await expect(page.getByText('Nu. 130.00')).toBeVisible()   // 2 × 65
    await page.getByRole('button', { name: /^Add$/ }).click()

    // Cart line carries the fractional quantity (2) at unit price 65.
    const row = page.locator('table tbody tr').first()
    await expect(row).toBeVisible()
    const txt = (await row.innerText()).replace(/\s+/g, ' ')
    console.log('WEIGHED_ROW', JSON.stringify(txt))
    expect(txt).toMatch(/\b2(\.0+)?\b/)   // quantity 2 (or 2.000)
    expect(txt).toMatch(/65\.00/)          // unit price
    console.log('WEIGHED_OK')
  })
})
