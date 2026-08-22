const { test, expect } = require('@playwright/test')

// video:'on' is set on the `pelbu` project so every test below is recorded.
// Manager auth (manager-auth.json) — covers the admin date override + complimentary.

test.describe('Pelbu P2/P3 — customer panel, price list, invoice lookup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('[title="Select customer (F6)"]')).toBeVisible({ timeout: 20000 })
  })

  test('header renders live invoice badge, price list, walk-in chip, salesperson', async ({ page }) => {
    await expect(page.getByText(/^Inv:/)).toBeVisible()
    const priceBadge = page.locator('[title^="Active price list:"]')
    await expect(priceBadge).toHaveText(/RETAIL/)
    await expect(page.locator('[title="Select customer (F6)"]')).toHaveText(/Walk-in Customer/)
    await expect(page.locator('[title="Sales person (F8)"]')).toBeVisible()
  })

  test('F6 opens the customer panel with Walk-in row + Mobile/Type/Outstanding columns', async ({ page }) => {
    await page.locator('[title="Select customer (F6)"]').click()
    await expect(page.getByText('Select Customer')).toBeVisible()
    // column headers unique to the panel
    await expect(page.getByText('Mobile No')).toBeVisible()
    await expect(page.getByText('Type', { exact: true })).toBeVisible()
    await expect(page.getByText('Outstanding')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Select Customer')).toBeHidden()
  })

  test('F7 cycles the price list RETAIL → WHOLESALE → DISTRIBUTOR → RETAIL', async ({ page }) => {
    const badge = page.locator('[title^="Active price list:"]')
    await expect(badge).toHaveText(/RETAIL/)
    await page.keyboard.press('F7')
    await expect(badge).toHaveText(/WSALE/)
    await page.keyboard.press('F7')
    await expect(badge).toHaveText(/DISTR/)
    await page.keyboard.press('F7')
    await expect(badge).toHaveText(/RETAIL/)
  })

  test('double-click the invoice badge opens invoice lookup', async ({ page }) => {
    await page.locator('[title="Next invoice number — double-click to search past invoices"]').dblclick()
    await expect(page.getByText('Search Invoices')).toBeVisible()
    await expect(page.getByPlaceholder(/Invoice no/)).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
