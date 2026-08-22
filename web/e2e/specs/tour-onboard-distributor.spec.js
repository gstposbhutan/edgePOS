const { test, expect } = require('@playwright/test')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED ONBOARDING TOUR — Distributor (top-of-chain B2B console). Unlike the quick distributor
// flow tour, this one EXPLAINS EVERY SCREEN'S COMPONENTS first (via callout spotlights) and then
// walks the task. It covers the whole console — every sidebar tile, then the key screens: the
// distributor-only Wholesalers browse, the Catalog (three-tier B2B pricing + the NEW manufacturer
// cost/margin + distributor rate tier in the product form), Warehouses, the B2B Sell flow (per-line
// rate tier), incoming Orders, Credit/Khata, the NEW GST Report, and the NEW owner-only NQRC
// Payment-QR in Settings. Slow by design: the `tour` project adds slowMo and we pause between beats.
// Authenticated up-front via the distributor storage state — the console role-routes to /distributor.

test.use({ storageState: 'e2e/storage/distributor-auth.json' })

// Click a sidebar section link (the ConsoleShell <nav>) and wait for the section URL.
async function goToSection(page, name, urlRe, opts = {}) {
  await clearHighlight(page)
  await page.locator('nav').getByRole('link', { name, ...opts }).click()
  await expect(page).toHaveURL(urlRe, { timeout: 15000 })
  await beat(page, 1400)
}

test('Distributor onboarding tour — every console screen explained', async ({ page }) => {
  test.setTimeout(1_200_000)
  await installTour(page)

  // ─────────────────────────────────────────────────────────────────────────
  // TOUR INTRO
  // ─────────────────────────────────────────────────────────────────────────
  await page.goto('/distributor')
  await expect(page.getByRole('heading', { name: 'Distributor Console' })).toBeVisible({ timeout: 20000 })
  await beat(page, 800)

  await titleCard(page, {
    kicker: 'DISTRIBUTOR · B2B CONSOLE',
    title: 'The Distributor Console',
    sub: 'You sit at the top of the supply chain — supplying wholesalers and retailers. No cash register here; this is a pure B2B console. We tour every screen and explain every control.',
  }, { hold: 3600 })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 OF 9 — CONSOLE HOME (+ the whole sidebar, tile by tile)
  // ═════════════════════════════════════════════════════════════════════════
  await titleCard(page, {
    kicker: 'SCREEN 1 OF 9',
    title: 'Console home',
    sub: 'Your home base — the business header up top, and every section of the console down the left.',
  }, { hold: 2600 })

  // ── The header ──
  await callout(page, 'header a[aria-label="Home"]', {
    title: 'Home', text: 'The badge up here always takes you back to the console landing page.',
  })
  await callout(page, 'header h1', {
    title: 'Who you are', text: 'Your console name and, beneath it, the signed-in business — shown on every screen.',
  })
  await callout(page, 'header button:has-text("Sign out")', {
    title: 'Sign out', text: 'Ends your session and returns to the login screen.',
  })

  // ── The whole sidebar, then each tile ──
  await callout(page, 'nav', {
    title: 'The section nav', text: 'The whole B2B console lives in this one sidebar — every tier, every document, from one column.',
  })
  await callout(page, 'nav a:has-text("Wholesalers")', {
    step: 1, title: 'Wholesalers (distributor-only)', text: 'Browse every active wholesaler — the tier you sell to. This tab is distributor-only; a wholesaler never sees it.',
  })
  await callout(page, 'nav a:has-text("Retailers")', {
    step: 2, title: 'Retailers', text: 'Browse retailers too — the tier below your wholesalers. Star them, or watch the whole downstream network.',
  })
  await callout(page, 'nav a:has-text("Saved")', {
    step: 3, title: 'Saved', text: 'Your starred businesses from both tabs, kept one click away.',
  })
  await callout(page, 'nav a:has-text("Sell")', {
    step: 4, title: 'Sell', text: 'Sell to a wholesaler — pick a buyer, build their order from your catalog, and confirm it.',
  })
  await callout(page, 'nav a:has-text("Quotes & Orders")', {
    step: 5, title: 'Quotes & Orders', text: 'Your outgoing sales orders and quotations — draft documents you later turn into invoices.',
  })
  await callout(page, 'nav a:text-is("Orders")', {
    step: 6, title: 'Orders (incoming)', text: 'Orders wholesalers place with you — process, dispatch, deliver, complete.',
  })
  await callout(page, 'nav a:has-text("Catalog")', {
    step: 7, title: 'Catalog', text: 'The products you supply, each carrying your three-tier B2B pricing.',
  })
  await callout(page, 'nav a:has-text("Warehouses")', {
    step: 8, title: 'Warehouses', text: 'Your depots and buildings — add locations and mark a primary.',
  })
  await callout(page, 'nav a:has-text("Inventory")', {
    step: 9, title: 'Inventory', text: 'Stock on hand, broken out per warehouse.',
  })
  await callout(page, 'nav a:has-text("Purchases")', {
    step: 10, title: 'Purchases', text: 'Buy from your own upstream suppliers or manufacturers.',
  })
  await callout(page, 'nav a:has-text("Credit")', {
    step: 11, title: 'Credit (Khata)', text: 'The running credit you extend to the buyers below you.',
  })
  await callout(page, 'nav a:has-text("Terminals")', {
    step: 12, title: 'Terminals', text: 'Back-office desktop terminals licensed to your business — no cash register (that is retail-only).',
  })
  await callout(page, 'nav a:has-text("GST Report")', {
    step: 13, title: 'GST Report (NEW)', text: 'New — output tax, input credit and net GST payable, one click away.',
  })
  await callout(page, 'nav a:has-text("Team")', {
    step: 14, title: 'Team', text: 'Your staff logins and what each of them can do.',
  })
  await callout(page, 'nav a:has-text("Settings")', {
    step: 15, title: 'Settings', text: 'Your business profile — and, owner-only, the payment QR for online orders.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 2 OF 9 — WHOLESALERS (the distributor-only browse tab)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 16, title: 'Open Wholesalers', text: 'Tap Wholesalers — the tier a distributor supplies.' })
  await goToSection(page, 'Wholesalers', /\/distributor\/wholesalers/)

  await titleCard(page, {
    kicker: 'SCREEN 2 OF 9',
    title: 'Wholesalers',
    sub: 'The distributor-only browse tab: every active wholesaler you can supply, star, or connect to.',
  }, { hold: 2600 })

  await callout(page, 'h2:has-text("Wholesalers")', {
    title: 'Wholesalers', text: 'What makes a distributor different — you browse and supply the wholesaler tier from here.',
  })
  await callout(page, 'input[placeholder="Search by business name..."]', {
    title: 'Search the network', text: 'Type any business name to filter the platform-wide list of active wholesalers.',
  })
  await callout(page, 'div.divide-y.divide-border > div', {
    title: 'A wholesaler card', text: 'Each row shows the business name, WhatsApp number, address and TPN.',
  })
  await callout(page, 'button:has-text("Connect")', {
    title: 'Connect (supply link)', text: 'Creates a real supply link — it also auto-provisions the khata so you can sell them on credit.',
  })
  await callout(page, 'button[title="Save"]', {
    title: 'Star to save', text: 'A private bookmark — starred businesses gather under the Saved tab. Independent of connecting.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 3 OF 9 — CATALOG (three-tier B2B pricing + product-form cost/margin/tier)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 17, title: 'Open Catalog', text: 'Tap Catalog to see the products you supply.' })
  await goToSection(page, 'Catalog', /\/distributor\/catalog/)

  await titleCard(page, {
    kicker: 'SCREEN 3 OF 9',
    title: 'Catalog',
    sub: 'The products you supply — with a distributor’s three-tier pricing: retail (MRP), wholesale, and distributor.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("Catalog")', {
    title: 'Catalog', text: 'Your own products. The subtitle counts how many you supply.',
  })
  await callout(page, 'button:has-text("Products")', {
    title: 'Products tab', text: 'Your single SKUs — the everyday products you stock and sell.',
  })
  await callout(page, 'button:has-text("Packages")', {
    title: 'Packages tab', text: 'Bulk packs (pallet / box / bundle). Each is a sealed unit you can “Open” into its components.',
  })
  await callout(page, 'input[placeholder="Search name, SKU, or HSN code..."]', {
    title: 'Search & filter', text: 'Find a product by name, SKU or HSN; the Active / Inactive buttons narrow the list.',
  })
  await callout(page, 'button:has-text("Add Product")', {
    title: 'Add Product', text: 'Opens the product form — where you set your B2B prices, cost and margin.',
  })

  // A row (if any) shows the price columns; on an empty catalog these fall back to captions.
  await callout(page, 'p:has-text("wholesale")', {
    title: 'Wholesale price', text: 'The rate retailers buy at — the middle of your three tiers.',
  })
  await callout(page, 'p:has-text("Dist:")', {
    title: 'Distributor rate', text: 'A distributor also shows the third-tier distributor price on every row.',
  })

  // ── FLOW: open Add Product and explain the pricing block (cost, margin, distributor tier) ──
  await caption(page, { step: 18, title: 'Open the product form', text: 'Tap Add Product to see the pricing and cost fields.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /add product/i }).first().click(); await beat(page, 1100)

  const dlg = '[data-slot="dialog-content"]'
  await callout(page, `${dlg} input[placeholder="e.g. Wai Wai Noodles 75g"]`, {
    title: 'Product name', text: 'What the product is called across your catalog and on invoices.',
  })
  await callout(page, `${dlg} input[placeholder="e.g. 1902"]`, {
    title: 'HSN code', text: 'Required for GST — it categorises the product for the 5% tax.',
  })
  await callout(page, `${dlg} >> text=B2B Pricing`, {
    title: 'B2B pricing block', text: 'Here you set the three tier rates a distributor sells at. The server always re-prices authoritatively.',
  })
  await callout(page, `${dlg} label:has-text("Wholesale")`, {
    title: 'Wholesale rate', text: 'The rate retailers buy at — the default tier when you sell to a retailer.',
  })
  await callout(page, `${dlg} label:has-text("MRP")`, {
    title: 'MRP', text: 'The regulated maximum retail price — the top of the ladder, used for the Retail tier.',
  })
  await callout(page, `${dlg} label:has-text("Distributor")`, {
    title: 'Distributor rate (3rd tier)', text: 'The distributor-only tier — your keenest B2B rate, the default when you sell to a wholesaler.',
  })
  await callout(page, `${dlg} label:has-text("Manufacturer cost")`, {
    title: 'Manufacturer cost (NEW)', text: 'What you pay upstream to buy the item — the basis for your margin.',
  })
  await callout(page, `${dlg} label:has-text("Margin")`, {
    title: 'Live margin (NEW)', text: 'Computed for you — your distributor rate minus cost, in Ngultrum and as a percentage.',
  })
  await callout(page, `${dlg} label:has-text("Opening Stock")`, {
    title: 'Opening stock', text: 'The starting quantity on hand — later stock moves through receipts and sales, not this field.',
  })
  await callout(page, '#vendor_gst_exempt', {
    title: 'GST exempt', text: 'Tick for tax-free goods — no 5% GST is added on any channel.',
  })
  await callout(page, `${dlg} label:has-text("Reorder Point")`, {
    title: 'Reorder point', text: 'The low-stock threshold — an alert fires when stock falls to or below this.',
  })
  await callout(page, `${dlg} button:has-text("Add Product")`, {
    title: 'Add Product', text: 'Saves the product with its prices, cost and opening stock.',
  })
  await callout(page, `${dlg} button:has-text("Cancel")`, {
    title: 'Cancel', text: 'Closes the form without saving — we use this to leave the demo catalog untouched.',
  })

  await caption(page, { step: 19, title: 'Close the form', text: 'We tap Cancel so nothing is added.' })
  await clearHighlight(page)
  await page.locator(dlg).getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 4 OF 9 — WAREHOUSES
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 20, title: 'Open Warehouses', text: 'Tap Warehouses to manage your depots.' })
  await goToSection(page, 'Warehouses', /\/distributor\/warehouses/)

  await titleCard(page, {
    kicker: 'SCREEN 4 OF 9',
    title: 'Warehouses',
    sub: 'The buildings and depots where you store stock — one is your primary.',
  }, { hold: 2400 })

  await callout(page, 'h2:has-text("Warehouses")', {
    title: 'Warehouses', text: 'Your locations, with a running count. Inventory is tracked per warehouse.',
  })
  await callout(page, 'button:has-text("Add Warehouse")', {
    title: 'Add Warehouse', text: 'Register a new depot with a name and address.',
  })
  await callout(page, 'div.divide-y.divide-border > div', {
    title: 'A warehouse row', text: 'Each shows its name, address, and Primary / Inactive badges — with star, toggle, edit and delete actions.',
  })

  // ── FLOW: open Add Warehouse and explain each field ──
  await caption(page, { step: 21, title: 'Open Add Warehouse', text: 'Tap Add Warehouse to see the form.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /add warehouse/i }).first().click(); await beat(page, 1000)

  await callout(page, `${dlg} input[placeholder="e.g. Thimphu Main Depot"]`, {
    title: 'Name', text: 'The depot name — shown wherever you pick a source of stock.',
  })
  await callout(page, `${dlg} textarea`, {
    title: 'Address', text: 'Building, street and town — optional, but handy on dispatch paperwork.',
  })
  await callout(page, '#warehouse_is_primary', {
    title: 'Primary warehouse', text: 'Your main location — setting it here clears the flag on any other warehouse.',
  })
  await callout(page, '#warehouse_is_active', {
    title: 'Active', text: 'Inactive locations stay on record but are flagged as not in use.',
  })
  await callout(page, `${dlg} button:has-text("Add Warehouse")`, {
    title: 'Add Warehouse', text: 'Saves the depot to your list.',
  })
  await caption(page, { step: 22, title: 'Close the form', text: 'We tap Cancel to close without adding a depot.' })
  await clearHighlight(page)
  await page.locator(dlg).getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 5 OF 9 — SELL (B2B, with the per-line rate tier)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 23, title: 'Open Sell', text: 'Tap Sell to build an order for a wholesaler.' })
  await goToSection(page, 'Sell', /\/distributor\/sell/)

  await titleCard(page, {
    kicker: 'SCREEN 5 OF 9',
    title: 'Sell to a buyer',
    sub: 'Pick a linked buyer, build their order from your catalog, choose credit or cash, and confirm.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("Sell to a Buyer")', {
    title: 'Sell to a buyer', text: 'Seller-initiated B2B: you build the order for a wholesaler you supply.',
  })
  await callout(page, 'div.space-y-2 >> text=Buyers', {
    title: 'Your buyers', text: 'The wholesalers you are connected to. Pick one to open your catalog and start a cart.',
  })
  await caption(page, {
    step: 24, title: 'The rate tier is per line',
    text: 'Once you add products, every cart line carries a rate tier — Retail, Wholesale or Distributor. Selling to a wholesaler defaults each line to the Distributor rate; you can drop any line to another tier.',
  }, 3400)

  // Guarded interactive: only run if a linked buyer (and sellable stock) exists in the data.
  const buyerCards = page.locator('button.w-full.text-left.p-3')
  if (await buyerCards.count() > 0) {
    await caption(page, { step: 25, title: 'Pick a buyer', text: 'Tap a buyer to open your catalog for their order.' })
    await clearHighlight(page)
    await buyerCards.first().click(); await beat(page, 1400)

    await callout(page, 'input[placeholder="Search your products..."]', {
      title: 'Your catalog', text: 'Search and tap products to drop them into this buyer’s cart.',
    })
    const prodTile = page.locator('button:has-text("in stock")').first()
    if (await prodTile.count() > 0 && await prodTile.isEnabled()) {
      await prodTile.click(); await beat(page, 1000)
      await callout(page, 'select:has(option:has-text("Distributor rate"))', {
        title: 'Per-line rate tier', text: 'Set this line to Retail, Wholesale or Distributor rate — the price updates instantly and the server re-prices on submit.',
      })
      await callout(page, 'button:has-text("Confirm Sale")', {
        title: 'Confirm the sale', text: 'Confirms the order — your stock is deducted, the buyer receives it, and a credit sale debits their khata.',
      })
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 6 OF 9 — INCOMING ORDERS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 26, title: 'Open Orders', text: 'Tap Orders to see what buyers placed with you.' })
  await goToSection(page, 'Orders', /\/distributor\/orders/, { exact: true })

  await titleCard(page, {
    kicker: 'SCREEN 6 OF 9',
    title: 'Incoming orders',
    sub: 'Orders placed with you as the seller — expand one to fulfil it: process → dispatch → deliver → complete.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("Incoming Orders")', {
    title: 'Incoming orders', text: 'Every order where you are the seller, with a running count.',
  })
  await callout(page, 'main select', {
    title: 'Status filter', text: 'Narrow to Confirmed, Processing, Dispatched, Delivered, Completed, Cancelled or Refunded.',
  })
  await callout(page, 'div.divide-y.divide-border > div', {
    title: 'An order row', text: 'Shows the buyer, order number, date, payment method and total. Tap to expand the line items.',
  })
  await caption(page, {
    step: 27, title: 'Fulfilment lives inside a row',
    text: 'Expand an order and the seller actions appear — Start processing, Mark dispatched, Mark delivered, Mark completed, or Cancel. Post-fulfilment you can also refund all or selected lines, which returns stock on both sides and reverses the khata.',
  }, 3600)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 7 OF 9 — CREDIT (KHATA)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 28, title: 'Open Credit', text: 'Tap Credit to manage the khata you extend downstream.' })
  await goToSection(page, 'Credit', /\/distributor\/khata/)

  await titleCard(page, {
    kicker: 'SCREEN 7 OF 9',
    title: 'Credit (Khata)',
    sub: 'You are the creditor — the credit you extend to the tier below, with limits, repayments and freezes.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("Credit (Khata)")', {
    title: 'Credit (Khata)', text: 'Every buyer account you extend credit to, with the total outstanding across all of them.',
  })
  await callout(page, 'div.divide-y.divide-border > div', {
    title: 'A khata account', text: 'Each row shows the buyer, their status, credit limit and how much they owe. Tap to open the ledger.',
  })
  await caption(page, {
    step: 29, title: 'Actions live inside an account',
    text: 'Open an account and you can Record a payment, Set the credit limit and term, Freeze or unfreeze it, and (owner) Write off a balance — every move is written to the ledger below.',
  }, 3600)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 8 OF 9 — GST REPORT (NEW)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 30, title: 'Open GST Report', text: 'Tap GST Report — new for the B2B consoles.' })
  await goToSection(page, 'GST Report', /\/distributor\/reports/)

  await titleCard(page, {
    kicker: 'SCREEN 8 OF 9',
    title: 'GST Report (NEW)',
    sub: 'Output tax, input tax credit and net GST payable for any period — plus a monthly breakdown.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("GST Report")', {
    title: 'GST Report', text: 'A one-click view of your 5% GST position, entity-scoped to your business.',
  })
  await callout(page, 'input[type="date"]', {
    title: 'Date range', text: 'Pick the From and To dates — the whole report and monthly split recompute for that window.',
  })
  await callout(page, 'text=Gross sales', {
    title: 'Gross sales', text: 'Total turnover in the period, with the number of sales.',
  })
  await callout(page, 'text=Taxable sales', {
    title: 'Taxable sales', text: 'The slice of turnover that attracts 5% GST.',
  })
  await callout(page, 'text=Exempt sales', {
    title: 'Exempt sales', text: 'GST-exempt turnover — counted here but excluded from output tax.',
  })
  await callout(page, 'text=Output GST', {
    title: 'Output GST', text: 'The 5% GST you collected on sales — your liability.',
  })
  await callout(page, 'text=Input GST (ITC)', {
    title: 'Input GST / ITC', text: 'The GST you paid on B2B purchases — credited against what you owe.',
  })
  await callout(page, 'text=Net GST payable', {
    title: 'Net GST payable', text: 'Output minus input — what you actually remit for the period.',
  })
  await callout(page, 'text=/Input GST \\(ITC\\) covers/', {
    title: 'How it is computed', text: 'The footnote spells out that ITC comes from intra-platform B2B purchases, and exempt sales sit outside output GST.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 9 OF 9 — SETTINGS (+ the NEW owner-only NQRC Payment QR)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 31, title: 'Open Settings', text: 'Tap Settings to edit your business profile.' })
  await goToSection(page, 'Settings', /\/distributor\/settings/)
  await expect(page.getByRole('heading', { name: 'Business Settings' })).toBeVisible({ timeout: 15000 })

  await titleCard(page, {
    kicker: 'SCREEN 9 OF 9',
    title: 'Business Settings',
    sub: 'Your business profile — and, owner-only, the NEW Bhutan NQRC payment QR shown at online checkout.',
  }, { hold: 2800 })

  await callout(page, 'h1:has-text("Business Settings")', {
    title: 'Business Settings', text: 'The details that identify your business across the platform.',
  })
  await callout(page, 'text=Business Name', {
    title: 'Business Name', text: 'Your legal business name — shown on invoices and the console header.',
  })
  await callout(page, 'text=WhatsApp Number', {
    title: 'WhatsApp Number', text: 'The E.164 number used for receipts and order alerts.',
  })
  await callout(page, 'text=TPN / GSTIN', {
    title: 'TPN / GSTIN', text: 'Your Bhutan taxpayer number — it signs invoices for GST compliance.',
  })
  await callout(page, 'text=Shop Slug', {
    title: 'Shop Slug', text: 'The URL-safe handle for a public storefront, if you list one.',
  })
  await callout(page, 'text=Marketplace Bio', {
    title: 'Marketplace Bio', text: 'A short description shown on your storefront.',
  })
  await callout(page, 'text=Fulfilment', {
    title: 'Fulfilment', text: 'Delivery (a rider is dispatched), Pickup only, or Catalog only — how online orders are fulfilled.',
  })

  // ── The NEW owner-only NQRC Payment-QR section ──
  await callout(page, 'text=Payment QR (Bhutan NQRC)', {
    title: 'Payment QR (NEW · owner-only)', text: 'Store your bank/merchant NQRC details and the platform renders a scannable payment QR at checkout.',
  })
  await callout(page, 'label:has-text("Show a payment QR")', {
    title: 'Enable the QR', text: 'The master switch — tick it to reveal the merchant fields and show a QR for online payments.',
  })

  await caption(page, { step: 32, title: 'Reveal the merchant fields', text: 'Tick the switch — the NQRC bank details appear.' })
  await clearHighlight(page)
  await page.getByText('Show a payment QR for online payments').click(); await beat(page, 1000)

  await callout(page, 'label:has-text("Merchant name on QR")', {
    title: 'Merchant name', text: 'The name shown on the customer’s banking app. Defaults to your business name.',
  })
  await callout(page, 'label:text-is("City")', {
    title: 'City', text: 'The town the merchant is registered in, e.g. Thimphu — an NQRC data field.',
  })
  await callout(page, 'label:has-text("Merchant ID / account number")', {
    title: 'Merchant / account ID', text: 'Your merchant or account number from your bank onboarding.',
  })
  await callout(page, 'label:has-text("PSP / scheme GUID")', {
    title: 'PSP / scheme GUID', text: 'Identifies the NQRC scheme on the Bhutan Financial Switch — routes the funds.',
  })
  await callout(page, 'label:has-text("Merchant category (MCC)")', {
    title: 'MCC', text: 'Merchant category code (e.g. 5411) — classifies the business.',
  })
  await callout(page, 'label:has-text("Account template tag")', {
    title: 'Account template tag', text: 'The EMVCo tag (26–51) carrying the account block. Leave at 26 unless your bank says otherwise.',
  })
  await callout(page, 'text=/added automatically/', {
    title: 'Handled for you', text: 'The amount, BTN currency and checksum are added automatically — you only enter the bank fields.',
  })
  await callout(page, 'button:has-text("Save Changes")', {
    title: 'Save Changes', text: 'Persists your profile and, when the switch is on, lights up your checkout QR. We won’t save here — the demo profile stays as it is.',
  })

  // ─────────────────────────────────────────────────────────────────────────
  // WRAP UP
  // ─────────────────────────────────────────────────────────────────────────
  await clearHighlight(page)
  await titleCard(page, {
    kicker: 'DISTRIBUTOR · B2B CONSOLE',
    title: 'That’s the whole console',
    sub: 'Browse & connect wholesalers, price in three tiers, sell and fulfil, extend credit, file GST, and set your payment QR — the top of the supply chain, from one place.',
  }, { hold: 3200 })
  await caption(page, { step: 33, title: 'You’re ready to run your distribution', text: 'That’s every screen — welcome to the B2B console.' }, 3200)

  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
