const { test, expect } = require('@playwright/test')

// POS nav moved to a role-dynamic left sidebar; the top bar keeps actions (e.g. the notification bell).
test.describe('POS sidebar — manager', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })
  test('manager sees management nav + the bell is an action in the top bar', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('aside a[href="/pos/products"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside a[href="/pos/orders"]')).toBeVisible()
    await expect(page.locator('aside a[href="/pos/registers"]')).toBeVisible()
    await expect(page.locator('button[title="Notifications"]')).toBeVisible()
    console.log('SIDEBAR_MANAGER_OK')
  })
})

test.describe('POS sidebar — cashier', () => {
  test.use({ storageState: 'e2e/storage/cashier-auth.json' })
  test('cashier does not see management-only nav', async ({ page }) => {
    await page.goto('/pos')
    // Orders is visible to all; Products/Registers are management-only → hidden for a cashier.
    await expect(page.locator('aside a[href="/pos/orders"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside a[href="/pos/products"]')).toHaveCount(0)
    await expect(page.locator('aside a[href="/pos/registers"]')).toHaveCount(0)
    console.log('SIDEBAR_CASHIER_OK')
  })
})
