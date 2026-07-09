const { test, expect } = require('@playwright/test')

// GUIDED TOUR — Vendor POS: a single cash sale (kept small; other vendor flows are separate tours).
// Slow-paced via the `tour` project's slowMo + char-by-char search typing + pauses.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

const beat = (page, ms = 1400) => page.waitForTimeout(ms)

test('TOUR — POS: ring up a cash sale', async ({ page }) => {
  test.setTimeout(120_000)

  // 1) The cashier opens the register.
  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await beat(page, 1800)

  // 2) Search a product (F3) and add it — typed one letter at a time.
  await page.keyboard.press('F3'); await beat(page)
  const modal = page.locator('.fixed.inset-0').last()
  const search = modal.getByPlaceholder(/Search product name or SKU/)
  await search.click()
  await search.pressSequentially('Druk', { delay: 160 }); await beat(page)
  await modal.locator('table tbody tr').first().click(); await beat(page, 1600)

  // 3) Tender (F10) → Cash → Exact → Complete.
  await page.keyboard.press('F10'); await beat(page)
  const pay = page.locator('[role="dialog"], .fixed.inset-0').last()
  await pay.getByRole('button', { name: /cash/i }).click(); await beat(page)
  await pay.getByRole('button', { name: /exact/i }).click(); await beat(page)
  const complete = pay.getByRole('button', { name: /complete/i })
  await expect(complete).toBeEnabled()
  await complete.click(); await beat(page, 2600)
})
