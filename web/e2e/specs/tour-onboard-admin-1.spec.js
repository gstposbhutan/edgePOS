const { test, expect } = require('@playwright/test')
const { VENDOR_USERS, TEST_ENTITY } = require('../fixtures/test-data')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED ONBOARDING TOUR (1 of 3) — Platform Super-Admin. Brand intro + sign in, then the Dashboard,
// Entities (with the NEW per-vendor Payment QR / NQRC editor) and Users screens. Split out of the full
// onboarding tour so each segment records a short .webm we later join with ffmpeg. Slow by design: the
// `tour` project adds slowMo and we type char-by-char and pause between beats.
// Live login as admin@nexus.bt (Staff tab, password test1234).

// Type a string one character at a time into a locator.
async function slowType(locator, text, delay = 90) { await locator.click(); await locator.pressSequentially(text, { delay }) }

test('Super-admin onboarding tour (1/3) — sign in, dashboard, entities & users', async ({ page }) => {
  await installTour(page)

  // ─────────────────────────────────────────────────────────────────────────
  // TOUR INTRO
  // ─────────────────────────────────────────────────────────────────────────
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'PLATFORM · SUPER ADMIN',
    title: 'The Platform Console',
    sub: 'You govern the whole Pelbu ecosystem. We tour every screen, explain every control, then set a vendor’s Payment QR together.',
  }, { hold: 3400 })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 OF 11 — SIGN IN
  // ═════════════════════════════════════════════════════════════════════════
  await titleCard(page, {
    kicker: 'SCREEN 1 OF 11',
    title: 'Sign in',
    sub: 'Staff and business accounts sign in with email + password.',
  }, { hold: 2200 })

  await callout(page, 'button:has-text("Customer")', {
    title: 'Customer tab', text: 'The default tab — shoppers sign in here with a one-time email code. Not you.',
  })
  await callout(page, 'button:has-text("Staff")', {
    title: 'Staff tab', text: 'Every business and platform account lives here. Tap it to reveal the email + password form.',
  })
  await caption(page, { step: 1, title: 'Switch to Staff', text: 'Tap the Staff tab to sign in as the platform operator.' })
  await page.getByRole('button', { name: 'Staff' }).click(); await beat(page, 900)

  await callout(page, 'input[placeholder="you@business.bt"]', {
    title: 'Email', text: 'Your platform admin email — this identity carries the SUPER_ADMIN role.',
  })
  await callout(page, 'input[placeholder="••••••••"]', {
    title: 'Password', text: 'Your account password. The eye icon reveals it if you need to check a typo.',
  })
  await callout(page, 'button:has-text("Sign In")', {
    title: 'Sign In', text: 'Confirms your credentials and drops you straight into the admin dashboard.',
  })

  await caption(page, { step: 2, title: 'Enter your credentials', text: 'Type your email and password, then Sign In.' })
  await clearHighlight(page)
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.admin.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.admin.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/admin', { timeout: 30000 }); await beat(page, 1600)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 2 OF 11 — DASHBOARD (+ the whole sidebar, item by item)
  // ═════════════════════════════════════════════════════════════════════════
  await clearCaption(page)
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'SCREEN 2 OF 11',
    title: 'Platform dashboard',
    sub: 'Your home base — live totals up top, and the console’s navigation down the left.',
  }, { hold: 2400 })

  // ── The left sidebar — walk every destination so you know what each one manages ──
  const sidebar = page.locator('aside')
  await callout(page, 'aside >> text=Pelbu Admin', {
    title: 'The admin console', text: 'The whole platform is run from this one sidebar — riders, catalog rules, releases, licences, and more.',
  })
  await callout(page, 'aside nav a:has-text("Dashboard")', {
    title: 'Dashboard', text: 'Where you are now — platform-wide totals for team, products, orders and revenue.',
  })
  await callout(page, 'aside nav a:has-text("Entities")', {
    title: 'Entities', text: 'Every business on the platform: distributors, wholesalers, retailers and customers. Suspend, feature, set Payment QR.',
  })
  await callout(page, 'aside nav a:has-text("Users")', {
    title: 'Users', text: 'Every human login across all businesses. Onboard staff, suspend accounts, toggle email alerts.',
  })
  await callout(page, 'aside nav a:has-text("Categories")', {
    title: 'Categories', text: 'The product-category tree. Configure the custom properties each category collects.',
  })
  await callout(page, 'aside nav a:has-text("Product Properties")', {
    title: 'Product Properties', text: 'The HSN-category custom-field templates that drive the product form and AI enrichment.',
  })
  await callout(page, 'aside nav a:has-text("Units")', {
    title: 'Units', text: 'The units of measurement (kg, litre, piece…) vendors pick when defining products.',
  })
  await callout(page, 'aside nav a:has-text("Riders")', {
    title: 'Riders', text: 'The last-mile delivery fleet — add riders, activate them, watch queue depth.',
  })
  await callout(page, 'aside nav a:has-text("Desktop App")', {
    title: 'Desktop App', text: 'Publish new POS terminal releases; the desktop app auto-updates to the latest published build.',
  })
  await callout(page, 'aside nav a:has-text("Licenses")', {
    title: 'Licenses', text: 'Issue machine-locked .lic files that activate and provision each POS terminal.',
  })
  await callout(page, 'aside nav a:has-text("Settings")', {
    title: 'Settings', text: 'Your own business profile — name, TPN, WhatsApp and marketplace details.',
  })

  // ── The top header + the KPI cards ──
  await callout(page, 'header span.font-serif', {
    title: 'Header — who you are', text: 'Your business name and role badge sit up here on every screen.',
  })
  await callout(page, 'header button[title="Sign out"]', {
    title: 'Sign out', text: 'Ends your session and returns to the login screen.',
  })
  await callout(page, 'text=Team Members', {
    title: 'Team Members', text: 'How many staff accounts exist platform-wide right now.',
  })
  await callout(page, 'text=Active Products', {
    title: 'Active Products', text: 'The live SKU count across every catalog on the platform.',
  })
  await callout(page, 'text=Completed Orders', {
    title: 'Completed Orders', text: 'Fulfilled orders counted across all shops.',
  })
  await callout(page, 'text=Total Revenue', {
    title: 'Total Revenue', text: 'Gross value transacted across the platform, in Ngultrum.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 3 OF 11 — ENTITIES (the star: per-vendor Payment QR / NQRC)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 3, title: 'Open Entities', text: 'Tap Entities to see every business on the platform.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Entities' }).click()
  await expect(page).toHaveURL(/\/admin\/entities/, { timeout: 15000 }); await beat(page, 1600)

  await titleCard(page, {
    kicker: 'SCREEN 3 OF 11',
    title: 'Entities',
    sub: 'Every distributor, wholesaler, retailer and customer — grouped by role, each with its own actions.',
  }, { hold: 2400 })

  await callout(page, 'h1:has-text("Entities")', {
    title: 'Entities', text: 'The master list of businesses. The subtitle shows the total on the platform.',
  })
  await callout(page, 'button:has-text("Add Entity")', {
    title: 'Add Entity', text: 'Register a new business — name, role, TPN, WhatsApp and credit limit.',
  })
  await callout(page, 'h2:has-text("RETAILER")', {
    title: 'Grouped by role', text: 'Entities are bucketed under DISTRIBUTOR, WHOLESALER, RETAILER and CUSTOMER for a quick scan.',
  })

  const dawai = page.locator('div.rounded-xl.p-3').filter({ hasText: TEST_ENTITY.name }).first()
  await dawai.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await callout(page, `div.rounded-xl.p-3:has-text("${TEST_ENTITY.name}")`, {
    title: 'An entity card', text: 'Each card shows the name, an Active/Suspended badge, a ★ Featured badge, plus its TPN and phone.',
  })
  await callout(page, `div.rounded-xl.p-3:has-text("${TEST_ENTITY.name}") button:has-text("Suspend")`, {
    title: 'Suspend / Reactivate', text: 'Freeze a business instantly — a suspended entity can’t transact. Tap again to reactivate.',
  })
  await callout(page, `div.rounded-xl.p-3:has-text("${TEST_ENTITY.name}") button:has-text("marketplace")`, {
    title: 'Feature on marketplace', text: 'Promote a retailer into the public curated catalog — only featured shops appear to shoppers.',
  })
  await callout(page, `div.rounded-xl.p-3:has-text("${TEST_ENTITY.name}") button:has-text("Payment QR")`, {
    title: 'Payment QR (NEW)', text: 'Set this vendor’s Bhutan NQRC merchant details so a scannable payment QR shows at online checkout.',
  })

  // ── FLOW: open the Payment QR (NQRC) editor and explain every field ──
  await caption(page, { step: 4, title: 'Open Payment QR', text: 'Tap Payment QR on a vendor card to open the NQRC editor.' })
  await clearHighlight(page)
  await dawai.getByRole('button', { name: /payment qr/i }).click(); await beat(page, 1200)

  const nqrc = page.locator('div.fixed.inset-0.z-50')
  await callout(page, 'text=/Payment QR —/', {
    title: 'The Payment QR editor', text: 'This stores a vendor’s Bhutan NQRC merchant profile. Pelbu turns it into a live EMVCo payment QR at checkout.',
  })
  await callout(page, 'text=Show a payment QR for online payments', {
    title: 'Enable the QR', text: 'The master switch — tick it to show a payment QR for this vendor’s online orders.',
  })
  await callout(page, 'input[placeholder^="Merchant name"]', {
    title: 'Merchant name', text: 'The name that appears on the customer’s banking app. Defaults to the business name.',
  })
  await callout(page, 'input[placeholder^="City"]', {
    title: 'Merchant city', text: 'The town the merchant is registered in, e.g. Thimphu — an NQRC data field.',
  })
  await callout(page, 'input[placeholder="Merchant ID / account number"]', {
    title: 'Merchant / account ID', text: 'The vendor’s merchant or account number from their bank onboarding.',
  })
  await callout(page, 'input[placeholder^="PSP"]', {
    title: 'PSP / scheme GUID', text: 'The payment-scheme identifier issued by the bank or RMA — it routes the funds.',
  })
  await callout(page, 'input[placeholder^="MCC"]', {
    title: 'MCC', text: 'Merchant category code (e.g. 5411 for grocery) — classifies the business.',
  })
  await callout(page, 'input[placeholder^="Tag"]', {
    title: 'Account tag', text: 'The EMVCo template tag (usually 26) that carries the account block. Leave the default unless the bank says otherwise.',
  })
  await callout(page, 'text=/EMVCo amount, BTN currency/', {
    title: 'Handled for you', text: 'The amount, BTN currency and checksum are added automatically — you only enter the bank fields.',
  })

  // Demonstrate enabling + typing a merchant name (we Cancel afterwards to leave seed data untouched).
  await caption(page, { step: 5, title: 'Fill the bank details', text: 'Tick the switch and enter the vendor’s merchant name.' })
  await clearHighlight(page)
  await nqrc.locator('input[type="checkbox"]').first().check(); await beat(page, 800)
  await slowType(page.locator('input[placeholder^="Merchant name"]'), 'Dawai Tshongkhang Store', 60); await beat(page, 800)

  await callout(page, 'div.fixed.inset-0.z-50 button:has-text("Save")', {
    title: 'Save', text: 'In practice you’d tap Save to store the NQRC profile and light up this vendor’s checkout QR.',
  })
  await callout(page, 'div.fixed.inset-0.z-50 button:has-text("Cancel")', {
    title: 'Cancel', text: 'Discards changes and closes the editor — we’ll use this to leave the demo store as it was.',
  })
  await caption(page, { step: 6, title: 'Close the editor', text: 'We tap Cancel here so the demo store stays unchanged.' })
  await clearHighlight(page)
  await nqrc.getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1400)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 4 OF 11 — USERS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 7, title: 'Open Users', text: 'Tap Users to manage every login on the platform.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Users' }).click()
  await expect(page).toHaveURL(/\/admin\/users/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 4 OF 11',
    title: 'Users',
    sub: 'Every human account, across every business — onboard, suspend, and control email alerts.',
  }, { hold: 2200 })

  await callout(page, 'h1:has-text("Users")', {
    title: 'Users', text: 'A flat list of all logins with their business, role and sub-role.',
  })
  await callout(page, 'button:has-text("Onboard User")', {
    title: 'Onboard User', text: 'Create a login for someone — pick their business, name, email, temp password and sub-role.',
  })
  await callout(page, 'div.rounded-lg.divide-y > div:first-child', {
    title: 'A user row', text: 'Shows the person’s name, email, their business, and their role / sub-role.',
  })
  await callout(page, 'button[title*="Email notifications"]', {
    title: 'Email alerts toggle', text: 'The bell turns this user’s transactional email alerts on or off.',
  })
  await callout(page, 'button:has-text("Suspend")', {
    title: 'Suspend', text: 'Bans a login immediately; it flips to Reactivate to restore access.',
  })

  // ── FLOW: open the Onboard form and explain each field, then close ──
  await caption(page, { step: 8, title: 'Open the Onboard form', text: 'Tap Onboard User to see how a new login is created.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: 'Onboard User' }).click(); await beat(page, 1000)

  await callout(page, 'div.fixed.inset-0.z-50 select', {
    title: 'Business', text: 'Which entity this login belongs to — every user is scoped to one business.',
  })
  await callout(page, 'input[placeholder="Full name *"]', {
    title: 'Full name', text: 'The person’s name, shown in the console header and on receipts.',
  })
  await callout(page, 'input[placeholder="Email *"]', {
    title: 'Email', text: 'Their sign-in identity and where password/OTP mail is sent.',
  })
  await callout(page, 'input[placeholder^="Temp password"]', {
    title: 'Temp password', text: 'A starter password (min 6 chars) they can change after first sign-in.',
  })
  await callout(page, 'div.fixed.inset-0.z-50 select >> nth=1', {
    title: 'Sub-role', text: 'OWNER, MANAGER, CASHIER or STAFF — this decides what they can do in their console.',
  })
  await callout(page, 'div.fixed.inset-0.z-50 button:has-text("Create")', {
    title: 'Create', text: 'Provisions the login and emails their credentials.',
  })
  await caption(page, { step: 9, title: 'Close the form', text: 'We tap Cancel to close without adding a user.' })
  await clearHighlight(page)
  await page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ─────────────────────────────────────────────────────────────────────────
  // END OF SEGMENT 1 OF 3
  // ─────────────────────────────────────────────────────────────────────────
  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
