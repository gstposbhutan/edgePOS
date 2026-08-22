const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor POS: a single cash sale, with on-screen instructional overlays baked into the
// recording (title card + per-step captions). Slow-paced via the `tour` project's slowMo + pauses.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — POS: ring up a cash sale', async ({ page }) => {
  test.setTimeout(150_000)
  await installTour(page)

  // 1) The cashier opens the register.
  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Vendor · Point of Sale',
    title: 'Ring up a cash sale',
    sub: 'Add an item, take payment — GST 5% is handled automatically.',
  })
  await caption(page, { step: 1, title: 'Open the register', text: 'The cashier lands on the POS screen with a shift already open.' }, 1800)

  // 2) Search a product (F3) and add it — typed one letter at a time.
  await caption(page, { step: 2, title: 'Find a product', text: 'Press F3 to search, type the name, then pick the match.' })
  await page.keyboard.press('F3'); await beat(page)
  const modal = page.locator('.fixed.inset-0').last()
  const search = modal.getByPlaceholder(/Search product name or SKU/)
  await search.click()
  await search.pressSequentially('Druk', { delay: 160 }); await beat(page)
  await modal.locator('table tbody tr').first().click(); await beat(page, 1600)

  // 3) Tender (F10) → Cash → Exact → Complete.
  await caption(page, { step: 3, title: 'Take payment', text: 'Press F10 to tender: choose Cash, tap Exact, then Complete.' })
  await page.keyboard.press('F10'); await beat(page)
  const pay = page.locator('[role="dialog"], .fixed.inset-0').last()
  await pay.getByRole('button', { name: /cash/i }).click(); await beat(page)
  await pay.getByRole('button', { name: /exact/i }).click(); await beat(page)
  const complete = pay.getByRole('button', { name: /complete/i })
  await expect(complete).toBeEnabled()
  await complete.click(); await beat(page, 2200)

  // 4) Done.
  await caption(page, { step: 4, title: 'Sale complete', text: 'The receipt is ready — print it or send it to the customer.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
