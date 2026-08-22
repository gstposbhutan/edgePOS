const { test, expect } = require('@playwright/test')
const { clearCart } = require('./v2-helpers')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor POS: per-line rate tier (Retail/Wholesale/Distributor) + per-line salesperson (F8).
test.use({ storageState: 'e2e/storage/manager-auth.json' })

async function openSearch(page, query) {
  await page.locator('body').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('F3')
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  await expect(modal).toBeVisible()
  await page.locator('[data-testid="keyboard-product-search-input"]').pressSequentially(query, { delay: 90 })
  await expect(modal.locator('table tbody tr').first()).toBeVisible()
  return modal
}

test('TOUR — POS: rate tiers and per-line salesperson', async ({ page }) => {
  test.setTimeout(160_000)
  await clearCart()
  await installTour(page)

  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await page.locator('body').click({ position: { x: 4, y: 4 } })
  await titleCard(page, {
    kicker: 'Vendor · POS',
    title: 'Price tiers & attribution',
    sub: 'Sell the same item at retail or wholesale, and credit each line to a salesperson.',
  })

  // 1) Retail line (default).
  await caption(page, { step: 1, title: 'Add at retail', text: 'The default rate is Retail — add the product to the bill.' })
  let modal = await openSearch(page, 'Druk'); await beat(page)
  await modal.locator('table tbody tr').first().click()
  await expect(page.locator('table tbody tr')).toHaveCount(1); await beat(page, 1400)

  // 2) Same item at wholesale → a separate line.
  await caption(page, { step: 2, title: 'Same item, wholesale rate', text: 'Switch the search to Wholesale — it lands as a separate line at the wholesale price.' })
  modal = await openSearch(page, 'Druk'); await beat(page)
  await modal.getByRole('button', { name: 'Wholesale' }).click(); await beat(page)
  await modal.locator('table tbody tr').first().click()
  await expect(page.locator('table tbody tr')).toHaveCount(2); await beat(page, 1800)

  // 3) Attribute the selected line to a salesperson (F8).
  await caption(page, { step: 3, title: 'Credit a salesperson (F8)', text: 'Press F8 to attribute the selected line to the staff member who sold it.' })
  await page.keyboard.press('F8')
  await expect(page.getByText('Select Sales Person')).toBeVisible()
  await page.locator('[data-testid="salesperson-option"]').filter({ hasText: 'Cashier' }).click({ force: true })
  await expect(page.getByText('Select Sales Person')).not.toBeVisible(); await beat(page, 2000)

  // 4) Done.
  await caption(page, { step: 4, title: 'Per-line control', text: 'Rate tier and salesperson are set line-by-line — perfect for mixed retail/wholesale carts.' }, 3000)
  await clearCaption(page); await beat(page, 800)
  await clearCart()
})
