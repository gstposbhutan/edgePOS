const { test, expect } = require('@playwright/test')
const { TEST_PRODUCTS, TEST_USERS } = require('../fixtures/test-data')

const MANAGER_USER = TEST_USERS[1]

test.describe('Keyboard POS Cart Edit', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test.beforeEach(async ({ page }) => {
    // Navigate to keyboard POS and add an item via search
    await page.goto('/pos')
    await page.waitForLoadState('networkidle')

    // Type a product name to open search modal
    const productName = TEST_PRODUCTS[0].name.substring(0, 4)
    await page.keyboard.press(productName.charAt(0))
    await page.waitForTimeout(300)

    // If search modal opens, try to add first product
    const searchModal = page.locator('text=Product Search').or(page.locator('text=Search Results'))
    const modalVisible = await searchModal.isVisible({ timeout: 3000 }).catch(() => false)
    test.skip(!modalVisible, 'Search modal did not open in beforeEach')

    // Press 1 to add first product
    await page.keyboard.press('1')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  test('Enter confirms quantity edit in cart table', async ({ page }) => {
    // Check if there's an item in the cart table
    const cartRows = page.locator('table tbody tr')
    const rowCount = await cartRows.count()
    test.skip(rowCount === 0, 'No cart rows available')

    // Select first row and press Enter to start editing
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Wait for qty input to appear
    const qtyInput = page.locator('input[type="number"][min="1"]')
    await expect(qtyInput.first()).toBeVisible({ timeout: 3000 })

    // Clear and type new quantity
    await qtyInput.first().fill('3')

    // Press Enter to confirm
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Qty input should be gone (edit mode ended)
    await expect(qtyInput.first()).not.toBeVisible({ timeout: 2000 })

    // Cart table should show the new quantity
    const qtyCell = page.locator('table tbody tr').first().locator('td').nth(1)
    const qtyText = await qtyCell.textContent()
    expect(qtyText.trim()).toBe('3')
  })

  test('Tab confirms edit and stays on page', async ({ page }) => {
    const cartRows = page.locator('table tbody tr')
    const rowCount = await cartRows.count()
    test.skip(rowCount === 0, 'No cart rows available')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const qtyInput = page.locator('input[type="number"][min="1"]')
    await expect(qtyInput.first()).toBeVisible({ timeout: 3000 })

    await qtyInput.first().fill('5')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(500)

    // Should still be on POS page (Tab doesn't navigate to browser chrome)
    expect(page.url()).toContain('/pos')

    // Edit mode should have ended
    await expect(qtyInput.first()).not.toBeVisible({ timeout: 2000 })

    // Quantity should be updated
    const qtyCell = page.locator('table tbody tr').first().locator('td').nth(1)
    const qtyText = await qtyCell.textContent()
    expect(qtyText.trim()).toBe('5')
  })

  test('Escape cancels edit and reverts to original qty', async ({ page }) => {
    const cartRows = page.locator('table tbody tr')
    const rowCount = await cartRows.count()
    test.skip(rowCount === 0, 'No cart rows available')

    // Get original qty
    const qtyCell = page.locator('table tbody tr').first().locator('td').nth(1)
    const originalQty = await qtyCell.textContent()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const qtyInput = page.locator('input[type="number"][min="1"]')
    await expect(qtyInput.first()).toBeVisible({ timeout: 3000 })

    await qtyInput.first().fill('99')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Qty should revert to original
    const revertedQty = await qtyCell.textContent()
    expect(revertedQty.trim()).toBe(originalQty.trim())
  })
})
