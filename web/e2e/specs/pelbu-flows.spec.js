const { test, expect } = require('@playwright/test')

// P4 flows on the keyboard POS /pos. video:'on' via the `pelbu` project.
// Manager auth so Ctrl+C (complimentary) is permitted.

test.describe('Pelbu P4 — six net-new flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('[data-ticket-ready="true"]')).toBeVisible({ timeout: 20000 })
  })

  // Add a product to the cart so the item-gated flows (quotation, complimentary,
  // market) can open. Returns once a cart line total is visible.
  async function addAProduct(page) {
    await page.keyboard.press('F8')
    const input = page.locator('[data-testid="keyboard-product-search-input"]')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill('Druk')
    const row = page.locator('[data-testid="keyboard-product-search-modal"] tbody tr').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    await row.click()
    await expect(input).toBeHidden({ timeout: 5000 })
    // settle the async cart refetch — wait for a priced cart line
    await expect(page.getByText(/→?\s*Nu\.\s*\d+\.\d{2}/).first()).toBeVisible({ timeout: 8000 })
  }

  test('F6 opens the salesperson picker', async ({ page }) => {
    // Salespeople are attributed per LINE now, so the key needs a line to attribute to.
    await addAProduct(page)
    await page.keyboard.press('F6')
    await expect(page.getByText(/Select Sales Person/)).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('Ctrl+L opens the delivery address modal', async ({ page }) => {
    await page.keyboard.press('Control+l')
    await expect(page.getByPlaceholder(/House no, street/)).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('Ctrl+E opens the exchange modal', async ({ page }) => {
    await page.keyboard.press('Control+e')
    await expect(page.getByText(/Return — find the original sale/)).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('with an item: Ctrl+Q quotation, Ctrl+C complimentary, Alt+M market', async ({ page }) => {
    await addAProduct(page)

    await page.keyboard.press('Control+q')
    await expect(page.getByRole('heading', { name: 'Save as draft' })).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+c')
    await expect(page.getByPlaceholder(/sample, staff, goodwill/)).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    await page.keyboard.press('Alt+m')
    await expect(page.getByRole('heading', { name: 'Post to Market' })).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })
})
