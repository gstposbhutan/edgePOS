const { test, expect } = require('@playwright/test')
const { TEST_PRODUCTS } = require('../fixtures/test-data')
const { clearCart } = require('./v2-helpers')

test.describe('Keyboard POS Cart Edit', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test.beforeEach(async ({ page }) => {
    // Each test needs a fresh cart — without this the qty accumulates across
    // tests and the Escape-reverts assertion races with the prior add.
    await clearCart()
    await page.goto('/pos')

    // Pressing any printable key in keyboard POS opens the product search modal
    // (see app/pos/page.jsx keyDown handler) and pre-fills with that character.
    const productInitial = TEST_PRODUCTS[0].name.charAt(0)
    await page.keyboard.press(productInitial)

    const searchModal = page.locator('[data-testid="keyboard-product-search-modal"]')
    await expect(searchModal).toBeVisible()

    // Wait for at least one result row to render before pressing the numeric
    // shortcut — the search is async (server roundtrip).
    await expect(searchModal.locator('table tbody tr').first()).toBeVisible()

    // Numeric shortcut "1" adds results[0] and closes the modal.
    await page.keyboard.press('1')
    await expect(searchModal).not.toBeVisible()

    // Cart row appears for the just-added product. Qty defaults to 1 — wait
    // for that to be reflected so downstream reads don't race with the add.
    await expect(page.locator('table tbody tr').first()).toBeVisible()
    await expect(page.locator('table tbody tr').first().locator('td').nth(1)).toHaveText('1')
  })

  test('Enter confirms quantity edit in cart table', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const qtyInput = page.locator('input[type="number"][min="1"]').first()
    await expect(qtyInput).toBeVisible()
    await expect(qtyInput).toBeFocused()

    await qtyInput.fill('3')
    await page.keyboard.press('Enter')

    await expect(qtyInput).not.toBeVisible()
    await expect(page.locator('table tbody tr').first().locator('td').nth(1)).toHaveText('3')
  })

  test('Tab confirms edit and stays on page', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const qtyInput = page.locator('input[type="number"][min="1"]').first()
    await expect(qtyInput).toBeVisible()
    // The cart-table component runs a setTimeout(20) to .select() the input
    // after mounting. fill() races with that focus call. Wait for focus.
    await expect(qtyInput).toBeFocused()

    await qtyInput.fill('5')
    await page.keyboard.press('Tab')

    expect(page.url()).toContain('/pos')
    await expect(qtyInput).not.toBeVisible()
    await expect(page.locator('table tbody tr').first().locator('td').nth(1)).toHaveText('5')
  })

  test('Escape cancels edit and reverts to original qty', async ({ page }) => {
    const qtyCell = page.locator('table tbody tr').first().locator('td').nth(1)
    const originalQty = (await qtyCell.textContent()).trim()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const qtyInput = page.locator('input[type="number"][min="1"]').first()
    await expect(qtyInput).toBeVisible()
    // The cart-table component runs a setTimeout(20) to .select() the input
    // after mounting. fill() races with that focus call. Wait for focus.
    await expect(qtyInput).toBeFocused()

    await qtyInput.fill('99')
    await page.keyboard.press('Escape')

    await expect(qtyInput).not.toBeVisible()
    await expect(qtyCell).toHaveText(originalQty)
  })
})
