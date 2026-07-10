// Desktop terminal tour, recorded via CHROMIUM against the running Electron app's served UI (:3200)
// + PocketBase (:8090). Sidesteps Playwright's broken Electron recordVideo. Reuses the web overlay.
const { chromium } = require('playwright')
const { installTour, titleCard, caption, clearCaption, beat } = require('./e2e/lib/tour-overlay')

const PB = 'http://127.0.0.1:8090'
const APP = 'http://127.0.0.1:3200'
const OWNER = { email: 'admin@pos.local', password: 'admin12345' }

async function seed() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json())
  const headers = { 'Content-Type': 'application/json', Authorization: auth.token }
  const ex = await fetch(`${PB}/api/collections/online_orders/records?filter=${encodeURIComponent('cloud_id="tour-oo"')}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }))
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: 'DELETE', headers }).catch(() => {})
  const res = await fetch(`${PB}/api/collections/online_orders/records`, {
    method: 'POST', headers, body: JSON.stringify({
      cloud_id: 'tour-oo', order_no: 'MKT-TOUR-0001', status: 'CONFIRMED', dispatch_state: 'ASSIGNED', fulfilment_mode: 'DELIVERY',
      grand_total: 315, gst_total: 15, subtotal: 300, items: [{ name: 'Tour Item', quantity: 3, total: 315 }],
      customer_name: 'Sonam', customer_phone: '+97517100011', delivery_address: 'Changzamtog, Thimphu',
      pickup_otp: '123456', rider_name: 'Karma Wangchuk', created_at_cloud: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error('seed failed: ' + (await res.text()))
}

;(async () => {
  await seed()
  const browser = await chromium.launch({ slowMo: 650 })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: '/out/videos', size: { width: 1280, height: 800 } } })
  const page = await ctx.newPage()
  await installTour(page)

  // 1) Sign in on the terminal.
  await page.goto(`${APP}/`)
  await titleCard(page, {
    kicker: 'Desktop Terminal · Online Orders',
    title: 'Orders come to the counter',
    sub: 'Marketplace orders land right on the shop terminal — even offline-resilient.',
  })
  await caption(page, { step: 1, title: 'The offline-first terminal', text: 'The shop’s POS runs locally on the counter, syncing when the network is up.' })
  const email = page.getByPlaceholder('admin@pos.local')
  if (await email.isVisible().catch(() => false)) {
    await email.click(); await email.pressSequentially(OWNER.email, { delay: 45 })
    await page.locator('input[type="password"]').fill(OWNER.password)
    await page.getByRole('button', { name: /sign in/i }).click()
  }
  await page.getByRole('button', { name: /open shift|close shift/i }).first().waitFor({ timeout: 30000 })
  await beat(page, 1200)

  // 2) Open the Online Orders screen.
  await caption(page, { step: 2, title: 'An incoming online order', text: 'A marketplace order arrives on the terminal, auto-confirmed and ready.' })
  await page.goto(`${APP}/online-orders.html`); await beat(page, 1200)
  await page.getByText('MKT-TOUR-0001').first().waitFor({ timeout: 20000 }); await beat(page, 1600)

  // 3) Customer details.
  await caption(page, { step: 3, title: 'Who it’s for', text: 'The customer’s name, phone, and delivery address are all on the card.' })
  await page.getByText('Sonam').first().waitFor({ timeout: 10000 }); await beat(page, 1800)

  // 4) Rider pickup OTP.
  await caption(page, { step: 4, title: 'Rider pickup code', text: 'Hand this code to the rider at pickup — it proves the right order left the shop.' })
  await page.getByText('Pickup code — give to Karma Wangchuk').first().waitFor({ timeout: 10000 }); await beat(page)
  await page.getByText('123456').first().waitFor({ timeout: 10000 }); await beat(page, 2200)

  // 5) Done.
  await caption(page, { step: 5, title: 'One terminal, every channel', text: 'In-store sales and online orders — handled from the same counter.' }, 3200)
  await clearCaption(page); await beat(page, 800)

  await ctx.close()   // flushes the video
  await browser.close()
  console.log('DESKTOP_TOUR_OK')
})().catch((e) => { console.error('DESKTOP_TOUR_FAIL', e.message); process.exit(1) })
