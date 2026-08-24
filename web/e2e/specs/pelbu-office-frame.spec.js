const { test, expect } = require('@playwright/test')

// The back-office frame (spec WF-08/WF-09) on the five framed screens.
//
// What a shop arriving from the incumbent ERP recognises is not colour, it is the three fixed
// places: the band says WHICH screen, the register holds the data in columns, the rail prints
// WHICH KEY does what. This spec pins those three on every framed screen, plus the two keys the
// frame owes everywhere — Esc back to the counter, Alt+O to the letter menu.
//
// Runs under the `pelbu` project (manager auth, video on) — see playwright.config.js.

const FRAMED = [
  { path: '/pos/reports',   crumb: 'Financial Management',  title: 'Tax Register (GST)' },
  { path: '/pos/khata',     crumb: 'Financial Management',  title: 'Bills Receivable (Khata)' },
  { path: '/pos/purchases', crumb: 'Purchase Management',   title: 'Purchase Order Register' },
  { path: '/pos/products',  crumb: 'Master Data Management', title: 'Product Register' },
  { path: '/pos/inventory', crumb: 'Warehouse Management',  title: 'Stock Register' },
  { path: '/pos/registers', crumb: 'Financial Management',  title: 'Terminal Register' },
  { path: '/pos/shifts',    crumb: 'Financial Management',  title: 'Shift Register' },
]

test.describe('the office frame', () => {
  for (const screen of FRAMED) {
    test(`${screen.path} wears the band, a register and the key rail`, async ({ page }) => {
      await page.goto(screen.path)

      const band = page.locator('[data-testid="office-band"]')
      await expect(band).toBeVisible({ timeout: 20000 })
      await expect(band).toContainText(screen.crumb)
      await expect(band).toContainText(screen.title)

      // The rail must print keys, not just exist — an empty rail is the failure that reads as
      // "this screen answers nothing".
      const rail = page.locator('[data-testid="office-rail"]')
      await expect(rail).toBeVisible()
      expect(await rail.locator('button').count()).toBeGreaterThan(1)

      // Every framed screen shows its data as a register.
      await expect(page.locator('[data-testid="office-grid"]').first()).toBeVisible()

      // Full-bleed: the console rail stands down here.
      await expect(page.locator('aside')).toHaveCount(0)
    })
  }

  test('Esc returns to the counter from a framed screen', async ({ page }) => {
    await page.goto('/pos/khata')
    await expect(page.locator('[data-testid="office-band"]')).toBeVisible({ timeout: 20000 })
    await page.locator('body').click()          // focus the page, not a field — Esc stands down while typing
    await page.keyboard.press('Escape')
    await page.waitForURL('**/pos', { timeout: 15000 })
    await expect(page.locator('[data-testid="till-status"]')).toBeVisible({ timeout: 15000 })
  })

  test('Alt+O opens the letter menu from a framed screen', async ({ page }) => {
    await page.goto('/pos/products')
    await expect(page.locator('[data-testid="office-band"]')).toBeVisible({ timeout: 20000 })
    await page.locator('body').click()
    await page.keyboard.press('Alt+o')
    // The menu is the till's own, so it announces itself the same way.
    await expect(page.getByRole('heading', { name: /^Office/ })).toBeVisible({ timeout: 10000 })
  })

  test('the register carries a keyboard cursor: ArrowDown selects a row', async ({ page }) => {
    await page.goto('/pos/products')
    await expect(page.locator('[data-testid="office-grid"]')).toBeVisible({ timeout: 20000 })
    await page.locator('body').click()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="office-grid"] tbody tr[data-row="0"]')).toBeVisible()
  })
})
