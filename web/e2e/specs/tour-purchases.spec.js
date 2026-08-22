const { test, expect } = require('@playwright/test')
const { TEST_WHOLESALER } = require('../fixtures/test-data')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor buy-side: create a Purchase Order, convert it to a Purchase Invoice, and
// confirm receipt (which restocks). Overlays baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — Purchases: PO → Purchase Invoice → receive stock', async ({ page }) => {
  test.setTimeout(200_000)
  await installTour(page)

  // 1) Start a new purchase order.
  await page.goto('/pos/purchases/new')
  await expect(page.getByText('New Purchase Order')).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Vendor · Purchases',
    title: 'Restock from a supplier',
    sub: 'Raise a purchase order, receive it as an invoice, and stock lands automatically.',
  })
  await caption(page, { step: 1, title: 'Pick a supplier', text: 'Start a new PO and choose who you are buying from.' })
  const supplierInput = page.getByPlaceholder(/search or enter supplier/i)
  await supplierInput.pressSequentially(TEST_WHOLESALER.name, { delay: 60 }); await beat(page)
  await page.getByText(TEST_WHOLESALER.name).first().click(); await beat(page, 1200)

  // 2) Add products to the order.
  await caption(page, { step: 2, title: 'Add products', text: 'Search your catalog and add the lines you want to restock.' })
  await page.getByRole('button', { name: /search products/i }).click(); await beat(page)
  const searchInput = page.getByPlaceholder('Search product name or SKU...')
  await expect(searchInput).toBeVisible()
  await searchInput.pressSequentially('Druk 1100', { delay: 90 }); await beat(page)
  await page.locator('table tbody tr').first().click(); await beat(page, 1400)

  // 3) Save the PO.
  await caption(page, { step: 3, title: 'Save the purchase order', text: 'The PO is saved as a draft you can send to the supplier.' })
  await page.getByRole('button', { name: /save purchase order/i }).click()
  await expect(page.getByText('Purchase Order Created')).toBeVisible({ timeout: 15000 }); await beat(page, 1600)
  await page.getByRole('button', { name: /view po/i }).click()
  await expect(page.getByText('DRAFT', { exact: true }).first()).toBeVisible({ timeout: 15000 })
  const poId = page.url().split('/').pop(); await beat(page, 1600)

  // 4) Convert to a Purchase Invoice.
  await caption(page, { step: 4, title: 'Convert to an invoice', text: 'When the goods arrive, turn the PO into a Purchase Invoice — with batch + cost.' })
  await page.getByRole('button', { name: /convert to purchase invoice/i }).click()
  const overlay = page.locator('.fixed.inset-0')
  await expect(overlay).toBeVisible()
  const batchInput = overlay.locator('input[placeholder="Optional"]').first()
  if (await batchInput.isVisible({ timeout: 2000 }).catch(() => false)) await batchInput.fill('TOUR-BATCH-001')
  const expiryInput = overlay.locator('input[type="date"]').first()
  if (await expiryInput.isVisible({ timeout: 2000 }).catch(() => false)) await expiryInput.fill('2027-12-31')
  await beat(page, 1200)
  await overlay.getByRole('button', { name: /create purchase invoice/i }).click()
  await page.waitForURL((url) => { const p = new URL(url).pathname; return p.startsWith('/pos/purchases/') && !p.endsWith(`/${poId}`) }, { timeout: 20000 })
  await beat(page, 1600)

  // 5) Confirm receipt → stock is restocked.
  await caption(page, { step: 5, title: 'Confirm receipt', text: 'Confirming receipt restocks every line into inventory automatically.' })
  const confirmButton = page.getByRole('button', { name: /^Confirm Receipt/i })
  await expect(confirmButton).toBeVisible({ timeout: 15000 })
  page.on('dialog', d => d.accept())
  const receiptResponse = page.waitForResponse((res) => /\/api\/purchases\/.*\/confirm/i.test(res.url()) && res.request().method() === 'POST', { timeout: 15000 }).catch(() => null)
  await confirmButton.click()
  await receiptResponse; await beat(page, 2000)

  // 6) Done.
  await caption(page, { step: 6, title: 'Stock landed', text: 'PO → invoice → stock, with a CREDIT purchase posting to the supplier khata if unpaid.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
