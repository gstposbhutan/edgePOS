const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor catalog: AI product enrichment. Edit a product, let the AI write its
// description/category/HSN/specs, then generate a catalog image. Drives the real z.ai/GLM engine,
// so the AI steps allow a long wait. Overlays baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — Catalog: AI product enrichment', async ({ page }) => {
  test.setTimeout(300_000)
  await installTour(page)

  // 1) Open the catalog and edit a product.
  await page.goto('/pos/products')
  await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Vendor · Catalog',
    title: 'Let AI do the data entry',
    sub: 'Enrich a product’s details and generate its image with one click.',
  })
  await caption(page, { step: 1, title: 'Open a product', text: 'Search the catalog and open a product to edit.' })
  await page.getByPlaceholder(/Search name, SKU/i).pressSequentially('Notebook', { delay: 90 }); await beat(page)
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await expect(page.getByRole('button', { name: /Enrich with AI/i })).toBeVisible({ timeout: 15000 }); await beat(page, 1400)

  // 2) Enrich the metadata with AI.
  await caption(page, { step: 2, title: 'Enrich with AI', text: 'The AI writes a description, category, HSN code, brand, tags and specs.' })
  const enrichBtn = page.getByRole('button', { name: /Enrich with AI/i })
  await enrichBtn.click()
  await expect(enrichBtn).toBeDisabled({ timeout: 5000 }).catch(() => {})   // spinner while it thinks
  await expect(enrichBtn).toBeEnabled({ timeout: 150_000 })                 // AI returned
  await beat(page, 2000)

  // 3) Generate a catalog image with AI.
  const imgBtn = page.getByRole('button', { name: /Generate image/i })
  if (await imgBtn.isVisible().catch(() => false)) {
    await caption(page, { step: 3, title: 'Generate an image', text: 'No photo? The AI paints a clean catalog image for the product.' })
    await imgBtn.click()
    await expect(imgBtn).toBeDisabled({ timeout: 5000 }).catch(() => {})
    await expect(imgBtn).toBeEnabled({ timeout: 150_000 })
    await beat(page, 2500)
  }

  // 4) Done — a fully described, imaged product in seconds.
  await caption(page, { step: 4, title: 'A rich catalog, instantly', text: 'What took minutes of typing per product now takes one click.' }, 3200)
  await clearCaption(page); await beat(page, 800)
})
