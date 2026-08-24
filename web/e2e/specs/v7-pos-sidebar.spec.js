const { test, expect } = require('@playwright/test')

// The POS nav rail, and the two places it deliberately does NOT appear.
//
// Rewritten 2026-08-24. The original asserted the rail on `/pos`, which stopped being true when
// the counter went full-screen (58aae63) — it had been failing since. The model now has three
// kinds of screen and this spec pins all three, so the next person changing one finds out here:
//
//   /pos                    the counter — full-screen till, no rail, Alt+O reaches the office
//   office-framed screens   full-bleed registers, no rail, own band + key rail, Alt+O
//   every other /pos screen the console look, role-filtered rail
//
// The rail's CONTENTS are still role-dynamic, which is the part worth guarding: a cashier must
// not be shown management destinations.

test.describe('POS nav rail — manager', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('the counter is full-screen: no rail, and the office is reached by key', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('[data-testid="till-status"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside')).toHaveCount(0)
    // The notification bell is an action in the counter's own top bar — it is mounted by
    // app/pos/page.jsx and exists nowhere else, so this is the screen that owns it.
    await expect(page.locator('button[title="Notifications"]')).toBeVisible()
    console.log('SIDEBAR_COUNTER_FULLSCREEN_OK')
  })

  test('an office-framed screen is full-bleed and carries its own band and key rail', async ({ page }) => {
    await page.goto('/pos/khata')
    await expect(page.locator('[data-testid="office-band"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="office-rail"]')).toBeVisible()
    await expect(page.locator('aside')).toHaveCount(0)
    console.log('SIDEBAR_OFFICE_FULLBLEED_OK')
  })

  test('a console screen keeps the rail, with the management destinations', async ({ page }) => {
    await page.goto('/pos/orders')
    await expect(page.locator('aside a[href="/pos/products"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside a[href="/pos/orders"]')).toBeVisible()
    await expect(page.locator('aside a[href="/pos/khata"]')).toBeVisible()
    console.log('SIDEBAR_MANAGER_OK')
  })
})

test.describe('POS nav rail — cashier', () => {
  test.use({ storageState: 'e2e/storage/cashier-auth.json' })

  test('a cashier is not shown management destinations', async ({ page }) => {
    await page.goto('/pos/orders')
    // Orders is visible to all; Products/Khata/Registers are management-only.
    await expect(page.locator('aside a[href="/pos/orders"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('aside a[href="/pos/products"]')).toHaveCount(0)
    await expect(page.locator('aside a[href="/pos/khata"]')).toHaveCount(0)
    await expect(page.locator('aside a[href="/pos/registers"]')).toHaveCount(0)
    console.log('SIDEBAR_CASHIER_OK')
  })
})
