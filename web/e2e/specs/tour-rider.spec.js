const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_RIDER, TEST_ENTITY } = require('../fixtures/test-data')

// GUIDED TOUR — Rider delivery. Deliberately slow (slowMo in the `tour` project + char-by-char typing
// + pauses) so a viewer follows every click and keypress. Produces a .webm under test-results/.

function loadEnv() {
  if (process.env.SUPABASE_URL) return
  try {
    const fs = require('fs'); const path = require('path')
    const c = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf-8')
    for (const line of c.split('\n')) { const m = line.match(/^([^#=\s][^=]*)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim() }
  } catch {}
}
loadEnv()
function admin() {
  return createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

// Beat between narrated steps.
const beat = (page, ms = 1400) => page.waitForTimeout(ms)
// Type a string one character at a time into a locator.
async function slowType(locator, text, delay = 130) { await locator.click(); await locator.pressSequentially(text, { delay }) }
// Type into the 6-box OTP modal (auto-advances).
async function slowOtp(page, code) {
  await page.locator('div.fixed.inset-0 div.flex.gap-2.justify-center input').first().click()
  await page.keyboard.type(code, { delay: 220 })
}

async function seedOrder() {
  const supabase = admin()
  await supabase.from('riders').update({ is_available: true }).eq('id', TEST_RIDER.id)
  const { data: existing } = await supabase.from('orders').select('id, order_no')
    .eq('rider_id', TEST_RIDER.id).eq('order_type', 'MARKETPLACE').in('status', ['CONFIRMED', 'PROCESSING']).limit(1).maybeSingle()
  if (existing?.id) {
    await supabase.from('orders').update({ status: 'CONFIRMED', pickup_otp: '123456',
      pickup_otp_expires_at: new Date(Date.now() + 2 * 3600e3).toISOString(), delivery_otp: null }).eq('id', existing.id)
    return existing
  }
  const year = new Date().getFullYear()
  const { data: last } = await supabase.from('orders').select('order_no').like('order_no', `MKT-${year}-%`)
    .order('order_no', { ascending: false }).limit(1).maybeSingle()
  const serial = (last?.order_no ? parseInt(last.order_no.split('-')[2] ?? '0', 10) : 0) + 1
  const orderNo = `MKT-${year}-${String(serial).padStart(5, '0')}`
  const { data: order } = await supabase.from('orders').insert({
    order_type: 'MARKETPLACE', order_no: orderNo, order_source: 'MARKETPLACE_WEB', status: 'CONFIRMED',
    fulfilment_mode: 'DELIVERY', dispatch_state: 'ASSIGNED', seller_id: TEST_ENTITY.id, buyer_whatsapp: '+97517100011',
    items: [{ sku: 'TOUR', name: 'Tour Item', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
    subtotal: 100, gst_total: 5, grand_total: 105, payment_method: 'CREDIT',
    delivery_address: 'Changzamtog, Thimphu', rider_id: TEST_RIDER.id, assigned_at: new Date().toISOString(),
    pickup_otp: '123456', pickup_otp_expires_at: new Date(Date.now() + 2 * 3600e3).toISOString(),
  }).select('id, order_no').single()
  await supabase.from('order_items').insert({ order_id: order.id, name: 'Tour Item', quantity: 1, unit_price: 100, discount: 0, gst_5: 5, total: 105, status: 'ACTIVE' })
  return order
}

test('TOUR — Rider: log in, see the queue, pick up and deliver', async ({ page }) => {
  test.setTimeout(180_000)
  const order = await seedOrder()

  // 1) The rider opens the portal and signs in with their email.
  await page.goto('/rider/login'); await beat(page, 1800)
  await slowType(page.getByPlaceholder('you@example.com'), TEST_RIDER.email); await beat(page)
  await page.getByRole('button', { name: /send code/i }).click(); await beat(page, 1800)

  // 2) They enter the 6-digit code emailed to them.
  await slowType(page.getByPlaceholder('123456'), '123456'); await beat(page)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/rider'); await beat(page, 2200)

  // 3) The assigned delivery appears in their queue.
  const card = page.locator('div.border-2.rounded-xl').filter({ hasText: order.order_no })
  await expect(card).toBeVisible({ timeout: 15000 }); await beat(page, 2000)

  // 4) At the shop, the rider confirms pickup with the vendor's code.
  await card.getByRole('button', { name: /confirm pickup/i }).click(); await beat(page)
  await slowOtp(page, '123456'); await beat(page)
  await page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i }).click(); await beat(page, 2200)

  // 5) At the door, the rider confirms delivery with the customer's code.
  await expect(card.getByRole('button', { name: /confirm delivery/i })).toBeVisible({ timeout: 12000 })
  await card.getByRole('button', { name: /confirm delivery/i }).click(); await beat(page)
  await slowOtp(page, '123456'); await beat(page)
  await page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i }).click(); await beat(page, 2500)
})
