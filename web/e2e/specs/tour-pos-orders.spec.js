const { test, expect } = require('@playwright/test')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor back-office: order management — sales invoices + marketplace orders.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test('TOUR — POS: manage orders and marketplace deliveries', async ({ page }) => {
  test.setTimeout(160_000)
  await installTour(page)

  // 1) Open the orders workspace.
  await page.goto('/pos/orders?section=SALES'); await beat(page, 1400)
  await titleCard(page, {
    kicker: 'Vendor · Orders',
    title: 'One place for every order',
    sub: 'POS sales, sales orders, quotations, and online marketplace orders.',
  })
  await caption(page, { step: 1, title: 'Orders & invoices', text: 'Filter by status; open any order to see its detail and timeline.' }, 2200)

  // 2) The marketplace tab — online orders.
  const mktTab = page.getByRole('button', { name: /^marketplace$/i })
  if (await mktTab.isVisible().catch(() => false)) {
    await caption(page, { step: 2, title: 'Marketplace orders', text: 'Online orders arrive auto-confirmed, ready to hand to a rider.' })
    await mktTab.click(); await beat(page, 2200)
  }

  // 3) Open an order to show its detail + timeline.
  const orderRow = page.locator('button:has(> .flex-1)').first()
  if (await orderRow.isVisible().catch(() => false)) {
    await caption(page, { step: 3, title: 'Order detail', text: 'Every order carries a full status timeline and delivery details.' })
    await orderRow.click()
    await page.waitForURL('**/pos/orders/**', { timeout: 15000 }).catch(() => {})
    await beat(page, 2400)
  }

  // 4) Done.
  await caption(page, { step: 4, title: 'Cancel, refund, dispatch', text: 'Managers can cancel or refund with stock return, and share the rider’s pickup OTP.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
