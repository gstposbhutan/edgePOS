const { test, expect } = require('@playwright/test')
const path = require('path')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor onboarding: bulk-import a product + opening-stock catalog from the Excel
// template. Stops at the validated dry-run preview (does NOT commit) — no data is mutated.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

const IMPORT_FILE = path.join(__dirname, '..', 'fixtures', 'silver-pines-import.xlsx')

test('TOUR — Vendor: bulk product import from Excel', async ({ page }) => {
  test.setTimeout(150_000)
  await installTour(page)

  // 1) Open the catalog.
  await page.goto('/pos/products'); await beat(page, 1400)
  await titleCard(page, {
    kicker: 'Vendor · Onboarding',
    title: 'Import your catalog',
    sub: 'Fill the Excel template once and load your whole product list with opening stock.',
  })
  await caption(page, { step: 1, title: 'Start an import', text: 'From the catalog, open the Excel import tool.' })
  await page.getByRole('button', { name: /Import/i }).first().click()
  await expect(page.getByText('Import Products from Excel')).toBeVisible({ timeout: 15000 }); await beat(page, 1600)

  // 2) Upload the filled template → dry-run validation.
  await caption(page, { step: 2, title: 'Upload the template', text: 'Drop in the filled spreadsheet — every row is validated before anything is saved.' })
  await page.locator('input[type="file"]').setInputFiles(IMPORT_FILE)
  await expect(page.getByText(/of 47 rows/i)).toBeVisible({ timeout: 20000 }); await beat(page, 2200)

  // 3) The preview.
  await caption(page, { step: 3, title: 'Review before importing', text: 'All 47 rows validated — one click commits the whole catalog with opening stock.' }, 2600)
  await expect(page.getByRole('button', { name: /Import 47 products/i })).toBeVisible(); await beat(page, 1600)

  // 4) Done (we stop at the preview — no commit in the tour).
  await caption(page, { step: 4, title: 'Onboard in minutes', text: 'New vendors go from an empty shop to a full, priced catalog in one import.' }, 3000)
  await page.keyboard.press('Escape').catch(() => {})
  await clearCaption(page); await beat(page, 800)
})
