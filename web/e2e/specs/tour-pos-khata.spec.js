const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor POS: the khata (credit) ledger — credit customers and their running balances.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — POS: khata (credit customers)', async ({ page }) => {
  test.setTimeout(150_000)
  await installTour(page)

  // 1) Open the khata ledger.
  await page.goto('/pos/khata'); await beat(page, 1200)
  await titleCard(page, {
    kicker: 'Vendor · Khata',
    title: 'Credit, the Bhutanese way',
    sub: 'Track khata — trusted customers who buy on credit and settle later.',
  })
  await caption(page, { step: 1, title: 'The khata ledger', text: 'Every credit customer, their outstanding balance, and their credit limit.' })
  const row = page.locator('[data-testid="khata-account-row"][data-account-name="Karma Tshering"]')
  await expect(row).toBeVisible({ timeout: 15000 }); await beat(page, 2000)

  // 2) Open a customer's account.
  await caption(page, { step: 2, title: 'A customer account', text: 'Open an account to see its balance, credit limit, and full history.' })
  await row.click(); await beat(page, 2200)

  // 3) The account detail.
  await caption(page, { step: 3, title: 'Balance & history', text: 'Credit sales add to the balance; recording a repayment brings it back down.' }, 2600)
  await beat(page, 1400)

  // 4) Done.
  await caption(page, { step: 4, title: 'Enforced limits', text: 'Credit limits are enforced at checkout, and accounts can be frozen when needed.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
