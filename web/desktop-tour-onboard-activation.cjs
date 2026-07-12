// Desktop terminal ONBOARDING tour (LICENSE ACTIVATION + POST-APPROVAL STARTUP), recorded via
// CHROMIUM. This is the very first thing a shopkeeper sees on a brand-new terminal: the machine-locked
// activation screen, requesting a license, pasting the issued .lic, and then the terminal booting into
// the POS login. Like the other onboard tours it EXPLAINS EVERY SCREEN with callout() spotlights.
//
// TWO parts:
//   PART A — the real Electron activation screen (desktop/electron/activation.html). It is a static
//            file that talks to an Electron preload (window.activation). Chromium has no preload, so we
//            STUB window.activation via context.addInitScript BEFORE the page loads — the stub exists by
//            the time the page's own <script> runs on load.
//   PART B — the served POS at :3200 (represents proceed() opening the register): the login card, then a
//            sign-in that lands on the shift bar.
//
// Author-only: DO NOT run here. Intended runner (once the app is served at :3200 and activation.html is
// mounted at /desktop/electron/activation.html):
//   node desktop-tour-onboard-activation.cjs
const { chromium } = require('playwright')
const { installTour, titleCard, caption, clearCaption, callout, clearHighlight, beat } = require('./e2e/lib/tour-overlay')

// Part A screen: the real activation.html (mounted read-only in the docker). Overridable for local runs.
const ACT = process.env.ACT_HTML || 'file:///desktop/electron/activation.html'
// Part B: the served POS terminal (proceed() opens this after a successful activation).
const APP = 'http://127.0.0.1:3200'
const KICK = 'DESKTOP · ACTIVATION'
const OWNER = { email: 'admin@pos.local', password: 'admin12345' }

// The Electron preload the activation page expects. Chromium has none, so we inject a realistic stand-in
// BEFORE any navigation (context.addInitScript re-runs for every document, so it is present when the
// page's inline <script> calls window.activation.getMachineId() on load).
//   • getMachineId       — a stable machine fingerprint to hand the administrator
//   • getDefaultCloudUrl — the build-time cloud address, pre-filled into #serverUrl
//   • request            — registers this machine (PENDING → awaiting admin approval)
//   • activate           — verifies the .lic and returns the store + a bootstrap catalog-pull summary
//   • proceed            — normally closes the window and opens the POS (no-op here; we goto :3200)
const ACTIVATION_STUB = `
  window.activation = {
    getMachineId: () => 'win-3f2a1c9e-8b4d-4e21-9a77-1122aabbccdd',
    getDefaultCloudUrl: () => 'https://app.pelbu.com',
    request: (url) => new Promise((r) => setTimeout(() => r({ ok: true, status: 'PENDING' }), 600)),
    activate: (lic) => new Promise((r) => setTimeout(() => r({
      ok: true,
      payload: { store_name: 'Pelbu Store', expires_at: '2027-01-01T00:00:00Z' },
      bootstrap: { ok: true, products: 128, categories: 12, khata: 5, users: 3 },
    }), 1000)),
    proceed: () => true,
  };
`

;(async () => {
  const browser = await chromium.launch({ slowMo: 650 })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: '/out/videos', size: { width: 1280, height: 800 } } })

  // Register BOTH init scripts before the first goto, in order: (1) the window.activation stub so it
  // exists when activation.html's <script> runs, then (2) the tour overlay controller.
  await ctx.addInitScript({ content: ACTIVATION_STUB })
  const page = await ctx.newPage()
  await installTour(page)

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // PART A — THE ACTIVATION SCREEN
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  await page.goto(ACT, { waitUntil: 'domcontentloaded' })
  await beat(page, 900)

  await titleCard(page, {
    kicker: KICK,
    title: 'Activate this terminal',
    sub: 'A brand-new terminal is machine-locked — it needs a license before it can sell.',
  }, { hold: 3200 })

  await callout(page, 'h1', { step: 1, title: 'First boot', text: 'On day one, every terminal opens here. This POS needs a license before it can run.' })
  await callout(page, '#machineId', { step: 2, title: 'Your machine ID', text: 'This fingerprint is unique to this computer. Give it to your administrator — the license is locked to it.' })
  await callout(page, '#serverUrl', { step: 3, title: 'Your cloud', text: 'The cloud address is pre-filled at build time — you rarely need to touch it.' })
  await callout(page, '#requestBtn', { step: 4, title: 'Request a license', text: 'Click here to register this machine with the cloud so an administrator can issue its license.' })

  // Click Request → the stub resolves PENDING → the page writes the "Registered…" status.
  await page.locator('#requestBtn').click().catch(() => {})
  await beat(page, 1100)
  await callout(page, '#status', { step: 5, title: 'Awaiting approval', text: 'Registered. Now ask your administrator to issue the license — then come back and paste it below.' })

  // ── Approval has happened off-screen; the admin sends back a .lic. ──
  await callout(page, '#chooseBtn', { step: 6, title: 'Your license file', text: 'Once approved you get a .lic file — load it here, or just paste its text.' })
  await callout(page, '#licInput', { step: 7, title: 'Paste the license', text: 'Drop the license contents into this box. It always starts with "nxslic.".' })
  await page.locator('#licInput').fill('nxslic.DEMO.TOKEN').catch(() => {})
  await beat(page, 700)
  await callout(page, '#activateBtn', { step: 8, title: 'Activate', text: 'Click Activate — the terminal verifies the signature and unlocks itself for your shop.' })

  // Click Activate → the stub resolves ok after ~1s → the page writes the "Activated…" status and
  // schedules proceed(). We hold to let that success line render, then represent proceed() ourselves.
  await page.locator('#activateBtn').click().catch(() => {})
  await beat(page, 1400)
  await callout(page, '#status', { step: 9, title: 'Unlocked', text: 'Activated for Pelbu Store. Provisioning just pulled 128 products — the POS is opening.' }, 3000)
  await clearHighlight(page); await clearCaption(page); await beat(page, 700)

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // PART B — POST-APPROVAL STARTUP (proceed() opens the POS at :3200)
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' })
  await beat(page, 1000)

  await titleCard(page, {
    kicker: KICK,
    title: 'Post-approval startup',
    sub: 'With the license accepted, the terminal boots straight into the POS login.',
  }, { hold: 3000 })

  await callout(page, 'img[alt="Pelbu"]', { step: 10, title: 'Into the POS', text: 'Activation done, the terminal now starts up on the Pelbu login — every boot from now on lands here.' })
  await callout(page, 'input[placeholder="admin@pos.local"]', { step: 11, title: 'Your email', text: 'Sign in with the staff account your administrator set up for this terminal.' })
  await callout(page, '#password', { step: 12, title: 'Your password', text: 'Enter your password. It is the same one you use on the cloud.' })
  await callout(page, 'button:has-text("Sign In")', { step: 13, title: 'Sign in', text: "Tap Sign In and you're at the counter, ready for the first sale." })

  // Actually sign in so the tour ends on the live register (shift bar visible).
  const email = page.getByPlaceholder('admin@pos.local')
  await email.click().catch(() => {})
  await email.pressSequentially(OWNER.email, { delay: 45 }).catch(() => {})
  await page.locator('#password').fill(OWNER.password).catch(() => {})
  await page.getByRole('button', { name: /sign in/i }).click().catch(() => {})
  await page.getByRole('button', { name: /open shift|close shift/i }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await beat(page, 1000)

  // ── Outro ──
  await clearHighlight(page)
  await caption(page, { step: '', title: 'Ready to sell', text: 'Terminal activated and ready — provisioning already pulled the catalog.' }, 3600)
  await clearCaption(page); await beat(page, 900)

  await clearCaption(page); await clearHighlight(page)
  await ctx.close()   // flushes the video
  await browser.close()
  console.log('ACTIVATION_TOUR_OK')
})().catch((e) => { console.error('ACTIVATION_TOUR_FAIL', e.message); process.exit(1) })
