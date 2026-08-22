const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_RIDER, TEST_ENTITY } = require('../fixtures/test-data')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED ONBOARDING TOUR — Rider (last-mile delivery). Unlike the plain rider flow tour, this one
// EXPLAINS EVERY SCREEN'S COMPONENTS first (via callout spotlights) and then walks the task. Slow by
// design: the `tour` project adds slowMo + we type char-by-char and pause between beats. Records a
// .webm under test-results/. Live email-OTP login as rider@teststore.bt (dev/mock code 123456).

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

// Type a string one character at a time into a locator.
async function slowType(locator, text, delay = 130) { await locator.click(); await locator.pressSequentially(text, { delay }) }
// Type into the 6-box OTP modal (auto-advances).
async function slowOtp(page, code) {
  await page.locator('div.fixed.inset-0 div.flex.gap-2.justify-center input').first().click()
  await page.keyboard.type(code, { delay: 220 })
}

// Seed one CONFIRMED marketplace delivery, assigned to our test rider, with a known pickup OTP.
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

test('Rider onboarding tour — every screen explained, then a delivery end to end', async ({ page }) => {
  test.setTimeout(300_000)
  const order = await seedOrder()
  await installTour(page)

  // ─────────────────────────────────────────────────────────────────────────
  // TOUR INTRO
  // ─────────────────────────────────────────────────────────────────────────
  await page.goto('/rider/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'RIDER · LAST-MILE',
    title: 'Your Rider Portal',
    sub: 'We tour every screen — sign-in, your queue, history, profile — then deliver one order together.',
  }, { hold: 3200 })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — SIGN IN (email OTP)
  // ═════════════════════════════════════════════════════════════════════════
  await titleCard(page, {
    kicker: 'SCREEN 1 OF 5',
    title: 'Sign in',
    sub: 'No passwords — just your email and a one-time code.',
  }, { hold: 2200 })

  await callout(page, 'text=Rider Portal', {
    title: 'The Rider Portal', text: 'This is your home for every delivery. It works on any phone browser — nothing to install.',
  })
  await callout(page, 'input[placeholder="you@example.com"]', {
    title: 'Your email', text: 'Enter the email your shop registered for you. This is your only login identity.',
  })
  await callout(page, 'text=/6-digit login code/i', {
    title: 'How sign-in works', text: 'We email a fresh 6-digit code each time — there is no password to remember or leak.',
  })
  await callout(page, 'button:has-text("Send code")', {
    title: 'Send code', text: 'Tap this and check your email for the code.',
  })

  // Step 1 — send the code.
  await caption(page, { step: 1, title: 'Enter your email', text: 'The rider types their email, then taps Send code.' })
  await clearHighlight(page)
  await slowType(page.getByPlaceholder('you@example.com'), TEST_RIDER.email); await beat(page)
  await page.getByRole('button', { name: /send code/i }).click(); await beat(page, 1800)

  // The code screen appears.
  await callout(page, 'input[placeholder="123456"]', {
    title: 'The login code', text: 'Type the 6 digits from your email here.',
  })
  await callout(page, 'button:has-text("Sign in")', {
    title: 'Sign in', text: 'Confirms the code and opens your delivery queue.',
  })
  await callout(page, 'text=Resend code', {
    title: 'Stuck?', text: 'Resend code emails a new one; Change email lets you correct a typo.',
  })

  // Step 2 — enter the code and sign in.
  await caption(page, { step: 2, title: 'Enter the emailed code', text: 'The rider types the 6-digit code, then taps Sign in.' })
  await clearHighlight(page)
  await slowType(page.getByPlaceholder('123456'), '123456'); await beat(page)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/rider'); await beat(page, 1800)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — THE DELIVERY QUEUE (dashboard)
  // ═════════════════════════════════════════════════════════════════════════
  await clearCaption(page)
  await titleCard(page, {
    kicker: 'SCREEN 2 OF 5',
    title: 'Your delivery queue',
    sub: 'Everything you need for the day lives on one screen.',
  }, { hold: 2200 })

  const card = page.locator('div.border-2.rounded-xl').filter({ hasText: order.order_no })
  await expect(card).toBeVisible({ timeout: 15000 })

  // ── Header components ──
  await callout(page, 'header', {
    title: 'Top bar', text: 'Your name and role sit on the left; your shift and refresh controls on the right.',
  })
  await callout(page, 'header button:has-text("Online")', {
    title: 'Online / Offline toggle', text: 'Your availability switch. Online means dispatch can send you orders; Offline pauses new ones.',
  })
  await callout(page, 'header div.flex.items-center.gap-1', {
    title: 'Refresh & sign out', text: 'The circular arrow re-checks for new orders; the arrow-out button signs you off.',
  })

  // ── Stats + location ──
  await callout(page, 'div.grid.grid-cols-3', {
    title: 'Your day at a glance', text: 'In queue = orders to deliver now. Done today = completed since midnight. Total = all-time deliveries.',
  })
  await callout(page, 'text=/Location (sharing on|off)/i', {
    title: 'Location sharing', text: 'While you are Online we share your GPS so dispatch gives you the nearest pickups.',
  })

  // ── Availability demo: go offline (show the banner), then back online ──
  await caption(page, { step: 3, title: 'Go on / off shift', text: 'Tap the toggle to pause new orders — an offline banner reminds you.' })
  await page.locator('header').getByRole('button', { name: /^online$/i }).click(); await beat(page, 1400)
  await callout(page, 'text=/won\'t receive new orders/i', {
    title: 'Offline', text: 'While offline you keep any orders already in your queue, but no new ones arrive.',
  })
  await page.locator('header').getByRole('button', { name: /^offline$/i }).click(); await beat(page, 1400)
  await caption(page, { step: 4, title: 'Back online', text: 'Tap again to go Online — you are ready to receive and deliver.' })
  await beat(page, 1200)

  // ── The queue + one order card, component by component ──
  await callout(page, 'text=/Your Queue/', {
    title: 'Your queue', text: 'Assigned orders stack here. You can work them in any order — not strictly top to bottom.',
  })
  await callout(page, `text=${order.order_no}`, {
    title: 'Order card header', text: 'Each card shows its order number, the amount due, and a status badge.',
  })
  await callout(page, 'text="Pickup"', {
    title: 'Pickup — the shop', text: 'Where you collect the goods: the vendor’s name, address, and phone.',
  })
  await callout(page, 'text="Deliver to"', {
    title: 'Deliver to — the customer', text: 'The drop-off address (and an Open in Maps link when GPS is available).',
  })
  await callout(page, 'a[href^="tel:"]', {
    title: 'Tap to call', text: 'Any blue phone number is tap-to-call — reach the vendor or the customer instantly.',
  })
  await callout(page, 'text=/items?:/i', {
    title: 'What’s in the bag', text: 'A quick list of the items so you can check the handover.',
  })
  await callout(page, 'button:has-text("Reject")', {
    title: 'Reject', text: 'Can’t take this one? Reject sends it back to dispatch to re-assign.',
  })
  await callout(page, 'button:has-text("Confirm Pickup")', {
    title: 'Confirm Pickup', text: 'At the shop, tap this to start the vendor hand-off — verified by OTP next.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // FLOW — PICK UP (vendor OTP)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 5, title: 'Confirm pickup', text: 'At the shop, the rider taps Confirm Pickup to open the OTP pad.' })
  await clearHighlight(page)
  await card.getByRole('button', { name: /confirm pickup/i }).click(); await beat(page, 1200)

  await callout(page, 'div.fixed.inset-0 h2', {
    title: 'The OTP pad', text: 'Every hand-off is verified by a 6-digit code, so goods only move to the right rider.',
  })
  await callout(page, 'div.fixed.inset-0 div.flex.gap-2.justify-center', {
    title: 'Six-digit code', text: 'Ask the vendor for the code on their screen and type it in — it advances box to box.',
  })
  await callout(page, 'div.fixed.inset-0 button:has-text("Confirm")', {
    title: 'Confirm', text: 'Lights up once all six digits are in. Tap it to accept the goods.',
  })

  await caption(page, { step: 6, title: 'Enter the vendor’s code', text: 'Type the pickup OTP the vendor reads out, then Confirm.' })
  await clearHighlight(page)
  await slowOtp(page, '123456'); await beat(page)
  await page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i }).click(); await beat(page, 2200)

  // ═════════════════════════════════════════════════════════════════════════
  // FLOW — DELIVER (customer OTP)
  // ═════════════════════════════════════════════════════════════════════════
  await callout(page, 'button:has-text("Confirm Delivery")', {
    title: 'Now: Confirm Delivery', text: 'After pickup the card flips to Confirm Delivery — the last step at the customer’s door.',
  })
  await caption(page, { step: 7, title: 'Confirm delivery', text: 'At the door, the rider taps Confirm Delivery.' })
  await expect(card.getByRole('button', { name: /confirm delivery/i })).toBeVisible({ timeout: 12000 })
  await clearHighlight(page)
  await card.getByRole('button', { name: /confirm delivery/i }).click(); await beat(page, 1200)

  await callout(page, 'div.fixed.inset-0 div.flex.gap-2.justify-center', {
    title: 'Customer’s code', text: 'The customer’s delivery OTP was sent to their WhatsApp — ask for it and enter it here.',
  })
  await caption(page, { step: 8, title: 'Enter the customer’s code', text: 'Type the delivery OTP, then Confirm to close the order.' })
  await clearHighlight(page)
  await slowOtp(page, '123456'); await beat(page)
  await page.locator('div.fixed.inset-0').getByRole('button', { name: /^confirm$/i }).click(); await beat(page, 2400)

  // ── Post-delivery panels appear ──
  await caption(page, { step: 9, title: 'Delivered', text: 'The order leaves your queue and drops into today’s completed work.' })
  await beat(page, 1200)
  await callout(page, 'text=Collect delivery fee', {
    title: 'Collect delivery fee', text: 'After a drop-off, log the fee you collected here so it reconciles with the shop.',
  })
  await callout(page, 'input[placeholder="Delivery fee"]', {
    title: 'Fee amount', text: 'Enter the Nu. amount and Submit — the order is then fully settled.',
  })
  await callout(page, 'text=Recent Deliveries', {
    title: 'Recent deliveries', text: 'Your latest completed drops appear here. Tap View all for the full log.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — DELIVERY HISTORY
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 10, title: 'Open your history', text: 'Tap View all to see every delivery you’ve made.' })
  await clearHighlight(page)
  await page.locator('a[href="/rider/history"]').first().click()
  await page.waitForURL('**/rider/history'); await beat(page, 1600)

  await titleCard(page, {
    kicker: 'SCREEN 3 OF 5',
    title: 'Delivery history',
    sub: 'A permanent record of everything you’ve delivered.',
  }, { hold: 2200 })

  await callout(page, 'header a[href="/rider"]', {
    title: 'Back to queue', text: 'The arrow at top-left always returns you to your live queue.',
  })
  await callout(page, 'header h1', {
    title: 'Delivery History', text: 'Every completed order, newest first — up to your last twenty drops.',
  })
  await callout(page, 'main div.border.rounded-xl', {
    title: 'A history row', text: 'Each row shows the order number, drop-off address, date, final status, and the amount.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — PROFILE
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 11, title: 'Your profile', text: 'Let’s look at your account details.' })
  await clearHighlight(page)
  await page.goto('/rider/profile'); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 4 OF 5',
    title: 'Profile',
    sub: 'Who you are and how you sign in.',
  }, { hold: 2200 })

  await callout(page, 'main div.border.rounded-xl', {
    title: 'Your name', text: 'The name your shop registered for you — shown to vendors and customers on each order.',
  })
  await callout(page, 'text=How you sign in', {
    title: 'How you sign in', text: 'A reminder that login is email + a one-time code. To change your email, contact your admin.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — SIGN OFF
  // ═════════════════════════════════════════════════════════════════════════
  await page.goto('/rider'); await beat(page, 1400)
  await titleCard(page, {
    kicker: 'SCREEN 5 OF 5',
    title: 'That’s the whole portal',
    sub: 'Go online, pick up, deliver, confirm — every hand-off protected by an OTP.',
  }, { hold: 2600 })

  await callout(page, 'header div.flex.items-center.gap-1 button:last-child', {
    title: 'Sign out', text: 'Done for the day? Sign out here — your history stays saved for next time.',
  })
  await caption(page, { step: 12, title: 'You’re ready to ride', text: 'That’s everything — welcome to the team.' }, 3200)

  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
