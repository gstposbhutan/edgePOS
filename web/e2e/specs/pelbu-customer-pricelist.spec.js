const { test, expect } = require('@playwright/test')

// video:'on' is set on the `pelbu` project so every test below is recorded.
// Manager auth (manager-auth.json) — covers the admin date override + complimentary.

test.describe('Pelbu P2/P3 — customer panel, price list, invoice lookup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('[data-ticket-ready="true"]')).toBeVisible({ timeout: 20000 })
  })

  test('header renders the live invoice badge and the walk-in chip', async ({ page }) => {
    await expect(page.getByText(/^Inv:/)).toBeVisible()
    await expect(page.locator('[title="Customer (F9)"]')).toHaveText(/Walk-in Customer/)
    // The standing facts of the sale live on the till bar now (spec WF-01), not in the header.
    await expect(page.getByTestId('till-status')).toContainText('walk-in')
  })

  test('F6 opens the customer panel with Walk-in row + Mobile/Type/Outstanding columns', async ({ page }) => {
    await page.locator('[title="Customer (F9)"]').click()
    await expect(page.getByText('Select Customer')).toBeVisible()
    // column headers unique to the panel
    await expect(page.getByText('Mobile No')).toBeVisible()
    await expect(page.getByText('Type', { exact: true })).toBeVisible()
    await expect(page.getByText('Outstanding')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Select Customer')).toBeHidden()
  })

  // Alt+P is the counter price-list key (F7 is Party). Retail is the default and the till bar
  // only names a tier once it stops being the plain retail one — a cashier must not be able to
  // ring a wholesale bill without seeing why.
  test('Alt+P cycles the price list, and the till bar names the tier', async ({ page }) => {
    const status = page.getByTestId('till-status')
    await expect(status).not.toContainText('Wholesale')
    await page.keyboard.press('Alt+p')
    await expect(status).toContainText('Wholesale')
    await page.keyboard.press('Alt+p')
    await expect(status).toContainText('Distributor')
    await page.keyboard.press('Alt+p')
    await expect(status).not.toContainText('Distributor')
  })

  test('double-click the invoice badge opens invoice lookup', async ({ page }) => {
    await page.locator('[title="Next invoice number — double-click to search past invoices"]').dblclick()
    await expect(page.getByText('Search Invoices')).toBeVisible()
    await expect(page.getByPlaceholder(/Invoice no/)).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
