const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor: returns & refunds. Shows the Request-Refund and Cancel-Order flows (with the
// stock-return notice) on real orders. It opens the modals but does NOT submit — no data is mutated
// beyond resetting two seed orders to a demoable status. Overlays baked into the recording.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

const COMPLETED_ID = '00000000-0000-4000-8000-000000003001' // seed POS sale (refundable)
const CONFIRMED_ID = '00000000-0000-4000-8000-000000003002' // seed order (cancellable)

function admin() {
  if (!process.env.SUPABASE_URL) {
    try {
      const fs = require('fs'); const path = require('path')
      const c = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf-8')
      for (const line of c.split('\n')) { const m = line.match(/^([^#=\s][^=]*)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim() }
    } catch {}
  }
  return createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

test('TOUR — Returns & refunds (with stock return)', async ({ page }) => {
  test.setTimeout(150_000)
  // Put the two demo orders into a known, actionable state (idempotent).
  const supabase = admin()
  await supabase.from('orders').update({ status: 'COMPLETED' }).eq('id', COMPLETED_ID)
  await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', CONFIRMED_ID)

  await installTour(page)

  // 1) A completed sale — request a refund.
  await page.goto(`/pos/orders/${COMPLETED_ID}`); await beat(page, 1200)
  await titleCard(page, {
    kicker: 'Vendor · Returns',
    title: 'Refunds & cancellations',
    sub: 'Refund a sale or cancel an order — stock returns to inventory automatically.',
  })
  await caption(page, { step: 1, title: 'Request a refund', text: 'On a completed sale, the manager opens the refund flow.' })
  const refundBtn = page.getByRole('button', { name: /Request Refund/i })
  await expect(refundBtn).toBeVisible({ timeout: 15000 })
  await refundBtn.click()
  const modal = page.locator('[role="dialog"]')
  await expect(modal).toBeVisible(); await beat(page)

  await caption(page, { step: 2, title: 'Pick items + a reason', text: 'Choose full or partial items and record why — the refund is auditable.' })
  await modal.locator('div.flex.items-center.gap-3.p-2\\.5').first().click().catch(() => {}); await beat(page)
  await modal.locator('input[placeholder="e.g. Defective product, wrong item..."]').pressSequentially('Damaged in transit', { delay: 55 }); await beat(page, 2000)
  await page.keyboard.press('Escape').catch(() => {}); await beat(page, 800)

  // 2) A confirmed order — cancel it with stock return.
  await page.goto(`/pos/orders/${CONFIRMED_ID}`); await beat(page, 1200)
  await caption(page, { step: 3, title: 'Cancel an order', text: 'A confirmed order can be cancelled with a reason.' })
  const cancelBtn = page.getByRole('button', { name: /Cancel Order/i })
  await expect(cancelBtn).toBeVisible({ timeout: 15000 })
  await cancelBtn.click()
  const modal2 = page.locator('[role="dialog"]')
  await expect(modal2).toBeVisible(); await beat(page)
  await caption(page, { step: 4, title: 'Stock returns automatically', text: 'The cancelled quantities go straight back to inventory when confirmed.' })
  await modal2.locator('input[placeholder="e.g. Customer changed mind, wrong item..."]').pressSequentially('Customer changed mind', { delay: 55 }); await beat(page, 2200)
  await page.keyboard.press('Escape').catch(() => {})

  // 3) Done.
  await caption(page, { step: 5, title: 'Always reconciled', text: 'Every refund and cancellation writes an inventory movement, so stock always reconciles.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
