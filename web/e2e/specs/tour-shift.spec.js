const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { installTour, titleCard, caption, clearCaption, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Vendor: the cash-shift lifecycle — open the drawer, log a cash movement, read the
// Z-Report, and close & reconcile. Self-cleaning (ends the shift it opens). Overlays baked in.
test.use({ storageState: 'e2e/storage/manager-auth.json' })

const REGISTER_1 = '00000000-0000-4000-8000-000000007001'

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

test('TOUR — Shift lifecycle: open, cash drawer, Z-report, close', async ({ page }) => {
  test.setTimeout(200_000)
  // Idempotent: make sure no shift is already open on Register 1 so the tour can open one.
  const supabase = admin()
  await supabase.from('shifts').update({ status: 'CLOSED', closed_at: new Date().toISOString() })
    .eq('register_id', REGISTER_1).in('status', ['ACTIVE', 'CLOSING'])

  await installTour(page)
  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Vendor · Cash Shift',
    title: 'Open, run, and reconcile a shift',
    sub: 'A counted opening float, cash movements, a Z-report, and a reconciled close.',
  })

  // 1) Open the shift.
  await caption(page, { step: 1, title: 'Open your shift', text: 'Start the register with a counted opening float.' })
  await page.getByRole('button', { name: /Start Shift/i }).click()
  const shiftModal = page.locator('.fixed.inset-0').filter({ hasText: 'Opening Float' })
  await expect(shiftModal).toBeVisible({ timeout: 10000 }); await beat(page, 1600)
  await shiftModal.getByRole('button', { name: 'Start Shift' }).click()
  await expect(page.getByRole('button', { name: /Shift Active/i })).toBeVisible({ timeout: 15000 })
  if (await shiftModal.isVisible().catch(() => false)) {
    await shiftModal.locator('button:has(svg.lucide-x)').first().click().catch(() => {})
  }
  await expect(shiftModal).not.toBeVisible({ timeout: 8000 }).catch(() => {})
  await caption(page, { step: 2, title: 'Shift is live', text: 'The register is open — every sale now lands against this shift.' }, 2200)

  // 2) Log a cash movement.
  await caption(page, { step: 3, title: 'Cash in / out', text: 'Record a drawer pickup or top-up with a reason (Ctrl+Shift+X).' })
  await page.keyboard.press('Control+Shift+X')
  const cashModal = page.locator('.fixed.inset-0').filter({ hasText: 'Cash Drawer' })
  await expect(cashModal).toBeVisible({ timeout: 10000 })
  await cashModal.locator('input[type="number"]').first().pressSequentially('200', { delay: 120 })
  await cashModal.getByRole('button', { name: 'Petty Cash' }).click(); await beat(page)
  await cashModal.getByRole('button', { name: /^Record$/ }).click(); await beat(page, 1800)
  await cashModal.getByRole('button', { name: /^Close$/ }).click()
  await expect(cashModal).not.toBeVisible({ timeout: 8000 })

  // 3) Read the Z-Report.
  await caption(page, { step: 4, title: 'The Z-Report', text: 'End-of-day totals: orders, GST 5%, and the cash / khata / digital split (Ctrl+Shift+Z).' })
  await page.keyboard.press('Control+Shift+Z')
  const zModal = page.locator('.fixed.inset-0').filter({ hasText: 'Z-Report' })
  await expect(zModal).toBeVisible({ timeout: 10000 }); await beat(page, 2600)
  await zModal.getByRole('button', { name: /^Close$/ }).click()
  await expect(zModal).not.toBeVisible({ timeout: 8000 })

  // 4) Close & reconcile the shift.
  await caption(page, { step: 5, title: 'Close & reconcile', text: 'Count the drawer at close — the system checks it against what it expected.' })
  await page.getByRole('button', { name: /Shift Active/i }).click()
  // Confirm step (heading "End Shift").
  const confirmModal = page.locator('.fixed.inset-0').filter({ hasText: 'Are you sure you want to end' })
  await expect(confirmModal).toBeVisible({ timeout: 10000 })
  await confirmModal.getByRole('button', { name: 'End Shift' }).click()
  // Count step — the modal's heading changes, so re-scope by the new text.
  const countModal = page.locator('.fixed.inset-0').filter({ hasText: 'Count Cash in Drawer' })
  await expect(countModal).toBeVisible({ timeout: 10000 }); await beat(page, 1200)
  // Enter the expected total so the drawer balances (fall back to the opening float).
  let count = '5000'
  const expEl = countModal.locator('span.text-base.font-bold.text-primary').first()
  if (await expEl.isVisible().catch(() => false)) {
    const t = (await expEl.textContent()) || ''
    const n = t.replace(/[^\d.]/g, '')
    if (n) count = n
  }
  await countModal.locator('input[type="number"]').first().pressSequentially(count, { delay: 80 }); await beat(page, 1400)
  await countModal.getByRole('button', { name: /Submit Count/i }).click()
  // On a successful close the shift clears → the modal unmounts and the badge returns to "Start Shift".
  await expect(page.getByRole('button', { name: /Start Shift/i })).toBeVisible({ timeout: 15000 })
  await caption(page, { step: 6, title: 'Reconciled & closed', text: 'The shift is closed with a variance report — the drawer is accounted for.' }, 3000)
  await clearCaption(page); await beat(page, 800)
})
