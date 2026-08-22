const { test, expect } = require('@playwright/test')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// ─────────────────────────────────────────────────────────────────────────────
// GUIDED TOUR — RETAILER · OWNER onboarding (flagship, most thorough).
//
// This is the "explain every screen's components" tour for a shop OWNER on the web
// POS. It walks the FULL left-sidebar (every nav item the owner sees), then tours
// each console screen and callouts its components before doing the task flow. It
// showcases the newest features: the GST Report, the product GST-exempt toggle, the
// owner-only NQRC Payment-QR setup, and the ONLINE checkout that surfaces — in order
// — the dynamic payment QR, the "Scan receipt" OCR button, and the journal-number
// field.
//
// Signed in as the RETAILER OWNER (full access). Slow-paced via the `tour` project's
// slowMo + the overlay holds. Author-only: not run/recorded here.
// ─────────────────────────────────────────────────────────────────────────────
test.use({ storageState: 'e2e/storage/owner-auth.json' })

// Add a product from the F3 keyboard search — reused for the cart demo and the
// flagship ONLINE checkout at the end.
async function addProduct(page, query = 'Druk') {
  await page.keyboard.press('F3'); await beat(page)
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  const search = modal.locator('[data-testid="keyboard-product-search-input"]')
  await search.click()
  await search.pressSequentially(query, { delay: 150 }); await beat(page)
  await modal.locator('table tbody tr').first().click(); await beat(page, 1400)
}

test('TOUR — Owner: full console walkthrough + GST report + NQRC checkout', async ({ page }) => {
  test.setTimeout(2_700_000)
  await installTour(page)

  // ═══ Tour intro ══════════════════════════════════════════════════════════
  await page.goto('/pos')
  await page.locator('button[title="Select customer (F6)"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Retailer · Owner',
    title: 'Run your whole shop',
    sub: 'The owner sees every screen. This is the full guided tour — one console at a time.',
  }, { hold: 3200 })

  // ═══ SCREEN 1 — The Register + the left sidebar ══════════════════════════
  await titleCard(page, {
    kicker: 'Screen 1 · Register',
    title: 'Your command centre',
    sub: 'The left rail is how you move around. Let us name every button on it.',
  }, { hold: 2200 })

  // Expand the collapsed rail so labels are visible while we point at each item.
  const expandBtn = page.locator('button[title="Expand"]')
  if (await expandBtn.count()) { await expandBtn.first().click(); await beat(page, 900) }

  // ── The complete sidebar (every nav item the OWNER sees) ─────────────────
  await callout(page, 'aside a[href="/pos"]', { step: 1, title: 'Register', text: 'The till itself — search products, build the cart and take payment. You start here.' })
  await callout(page, 'aside a[href="/pos/orders"]', { step: 2, title: 'Orders', text: 'Every sale, online order and quotation — reprint receipts, cancel or refund from here.' })
  await callout(page, 'aside a[href="/pos/products"]', { step: 3, title: 'Products', text: 'Your catalogue: add items, set prices and HSN codes, build bundles and packages.' })
  await callout(page, 'aside a[href="/pos/inventory"]', { step: 4, title: 'Inventory', text: 'Live stock levels, batches, movement history and low-stock alerts.' })
  await callout(page, 'aside a[href="/pos/purchases"]', { step: 5, title: 'Purchases', text: 'Buy-side: raise purchase orders to suppliers and receive them as invoices to restock.' })
  await callout(page, 'aside a[href="/pos/khata"]', { step: 6, title: 'Khata', text: 'Credit ledgers — who owes you, their limit, and their running balance.' })
  await callout(page, 'aside a[href="/pos/registers"]', { step: 7, title: 'Cash Registers', text: 'Your physical tills and terminals, each with its own opening float.' })
  await callout(page, 'aside a[href="/pos/shifts"]', { step: 8, title: 'Shifts', text: 'Closed cashier shifts with the drawer count and any cash variance. Owner-only.' })
  await callout(page, 'aside a[href="/pos/reports"]', { step: 9, title: 'GST Report', text: 'Output tax, input credit and net GST payable — your monthly filing, ready to read. NEW.' })
  await callout(page, 'aside a[href="/pos/team"]', { step: 10, title: 'Team', text: 'Add cashiers and managers and set what each can do. Owner-only.' })
  await callout(page, 'aside a[href="/pos/stores"]', { step: 11, title: 'Stores', text: 'Own more than one shop? Switch between them here. Owner-only.' })
  await callout(page, 'aside a[href="/pos/settings"]', { step: 12, title: 'Settings', text: 'Business profile, storefront and — for owners — your payment QR. Owner-only.' })
  await callout(page, 'aside a[href="/downloads"]', { step: 13, title: 'Desktop App', text: 'Download the offline Windows terminal that keeps selling when the internet drops.' })

  // ── Register top bar — the action strip ──────────────────────────────────
  await caption(page, { step: 14, title: 'The top bar', text: 'The header is actions only — navigation lives in the rail you just saw.' }, 1900)
  await callout(page, 'button[title="Select customer (F6)"]', { step: 15, title: 'Customer (F6)', text: 'Attach a customer to the sale for khata credit and a digital receipt.' })
  await callout(page, 'header button[title^="Next invoice"]', { step: 16, title: 'Next invoice no.', text: 'A live preview of the next invoice number. Double-click to search past invoices.' })
  await callout(page, 'header button[title*="Invoice date"]', { step: 17, title: 'Invoice date', text: 'The server clock stamped on the sale. As owner you can back-date one invoice.' })
  await callout(page, 'header button[title^="Cash In/Out"]', { step: 18, title: 'Cash In / Out', text: 'Record money added to or taken from the drawer mid-shift.' })
  await callout(page, 'header button[title^="Z-Report"]', { step: 19, title: 'Z-Report', text: 'The end-of-day cash and sales summary for the current drawer.' })
  await callout(page, 'header button:has-text("Shift")', { step: 20, title: 'Shift badge', text: 'Open a shift to count the drawer — selling works with or without one.' })
  await callout(page, 'header button[title="Sign out"]', { step: 21, title: 'Sign out', text: 'Signing out with an open shift prompts you to close it or hand it over first.' })

  // ── Shortcut bar — the keyboard map ──────────────────────────────────────
  await callout(page, 'button[title^="F10"]', { step: 22, title: 'Shortcut bar', text: 'Every till action has a key. F10 tenders the sale — no mouse needed.' })
  await callout(page, 'button[title^="F8"]', { step: 23, title: 'F8 · Salesperson', text: 'Tag the selected line to the staff member who sold it — for commission tracking.' })
  await callout(page, 'button[title^="Ctrl+M"]', { step: 24, title: 'Ctrl+M · Row discount', text: 'Discount a single line. Ctrl+D discounts the whole bill (before GST).' })

  // ── Build a cart to show the line + totals components ─────────────────────
  await caption(page, { step: 25, title: 'Add an item', text: 'Press F3, type a name, pick the match — the item drops into the cart.' })
  await addProduct(page, 'Druk')
  await callout(page, 'table tbody tr', { step: 26, title: 'Cart line', text: 'Name, unit price, quantity and per-line GST. Select it and use F8/F9/Ctrl+M to edit.' })
  await callout(page, 'text=Total: Nu.', { step: 27, title: 'Totals bar', text: 'Subtotal, any invoice discount, GST at 5% and the grand total — always live.' })

  // ═══ SCREEN 2 — Products (+ the NEW GST-exempt toggle) ═══════════════════
  await page.goto('/pos/products')
  await page.getByRole('heading', { name: 'Products' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 2 · Products',
    title: 'Your catalogue',
    sub: 'Everything you sell — with prices, HSN codes and the new GST-exempt flag.',
  }, { hold: 2200 })
  await callout(page, 'input[placeholder^="Search name"]', { step: 28, title: 'Search', text: 'Find any product by name, SKU or HSN code.' })
  await callout(page, 'button:has-text("Enrich all")', { step: 29, title: 'Enrich all', text: 'Let the AI engine fill in descriptions, categories, tags and images for the whole catalogue.' })
  await callout(page, 'button:has-text("Import")', { step: 30, title: 'Import', text: 'Bulk-load products and opening stock from an Excel template.' })
  await callout(page, 'button:has-text("Add Product")', { step: 31, title: 'Add Product', text: 'Create a single product by hand. Let us open it.' })

  await page.getByRole('button', { name: /add product/i }).first().click()
  await page.getByRole('heading', { name: /Add New Product/i }).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await callout(page, 'input[placeholder*="Wai Wai"]', { step: 32, title: 'Product name', text: 'What the item is called on the shelf and the receipt.' })
  await callout(page, 'input[placeholder="e.g. 1902"]', { step: 33, title: 'HSN code', text: 'Required for GST — it classifies the product for the tax authority.' })
  await callout(page, 'label[for="sold_by_weight"]', { step: 34, title: 'Sold by weight', text: 'For loose goods — rice, sugar, veg. The cashier weighs it in at checkout.' })
  await callout(page, 'label[for="gst_exempt"]', { step: 35, title: 'GST exempt · NEW', text: 'Tick this and the item sells tax-free on every channel — no 5% GST is added.' }, 3000)
  await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click(); await beat(page)

  // ═══ SCREEN 3 — Inventory ════════════════════════════════════════════════
  await page.goto('/pos/inventory')
  await page.getByRole('heading', { name: 'Inventory' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 3 · Inventory',
    title: 'Stock, live',
    sub: 'Levels, batches and every movement — kept honest automatically.',
  }, { hold: 2200 })
  await callout(page, '[data-testid="inventory-tabs"]', { step: 36, title: 'Views', text: 'Stock levels, batches, draft purchases, demand predictions and a full movement log.' })
  await callout(page, '[data-testid="low-stock-banner"], [data-testid="out-of-stock-banner"]', { step: 37, title: 'Stock alerts', text: 'Low- and out-of-stock items surface at the top so you can reorder before you run dry.' })
  await callout(page, 'text=Stock Levels', { step: 38, title: 'Stock table', text: 'Every item with its on-hand quantity — adjust it here when you count the shelf.' })

  // ═══ SCREEN 4 — Purchases ════════════════════════════════════════════════
  await page.goto('/pos/purchases')
  await page.getByRole('heading', { name: 'Purchases' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 4 · Purchases',
    title: 'Restock from suppliers',
    sub: 'Raise an order, receive it as an invoice, and stock lands on its own.',
  }, { hold: 2200 })
  await callout(page, 'button:has-text("Purchase Orders")', { step: 39, title: 'Purchase Orders', text: 'What you have ordered from suppliers but not yet received.' })
  await callout(page, 'button:has-text("Purchase Invoices")', { step: 40, title: 'Purchase Invoices', text: 'Received goods — confirming an invoice restocks the catalogue automatically.' })
  await callout(page, 'button:has-text("New PO")', { step: 41, title: 'New PO', text: 'Start a fresh purchase order: pick a supplier and add the lines to restock.' })

  // ═══ SCREEN 5 — Khata (credit) ═══════════════════════════════════════════
  await page.goto('/pos/khata')
  await page.getByRole('heading', { name: /Khata/i }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 5 · Khata',
    title: 'Credit ledgers',
    sub: 'The traditional shop khata — who owes you, and how much room they have left.',
  }, { hold: 2200 })
  await callout(page, 'input[placeholder="Search by name or phone..."]', { step: 42, title: 'Find a customer', text: 'Look up any credit account by name or phone number.' })
  await callout(page, '[data-testid="khata-account-row"]', { step: 43, title: 'Account', text: 'Each row shows the outstanding balance against the credit limit you set.' })

  // ═══ SCREEN 6 — Shifts ═══════════════════════════════════════════════════
  await page.goto('/pos/shifts')
  await page.getByText('Shift History').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 6 · Shifts',
    title: 'Drawer accountability',
    sub: 'Every closed cashier shift, with the count and any variance flagged.',
  }, { hold: 2200 })
  await callout(page, 'text=Shift History', { step: 44, title: 'Closed shifts', text: 'A history of drawer sessions.' })
  await callout(page, 'text=Variance', { step: 45, title: 'Variance', text: 'Counted cash minus expected — how you catch a short or over drawer.' })

  // ═══ SCREEN 7 — GST Report (NEW) ═════════════════════════════════════════
  await page.goto('/pos/reports')
  await page.getByRole('heading', { name: 'GST Report' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 7 · GST Report',
    title: 'Your tax, done',
    sub: 'Output tax, input credit and net GST payable — the numbers your filing needs. NEW.',
  }, { hold: 2600 })
  await page.getByText('Net GST payable').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await callout(page, 'input[type="date"] >> nth=0', { step: 46, title: 'Date range', text: 'Pick the period — a month for filing, a year for the full picture.' })
  await callout(page, 'text=Taxable sales', { step: 47, title: 'Taxable vs exempt', text: 'Turnover split into taxable sales and — thanks to the new flag — GST-exempt sales.' })
  await callout(page, 'text=Output GST', { step: 48, title: 'Output GST', text: 'The 5% GST you collected on sales — what you owe.' })
  await callout(page, 'text=Input GST (ITC)', { step: 49, title: 'Input GST (ITC)', text: 'GST you paid on platform purchases — credit that offsets what you owe.' })
  await callout(page, 'text=Net GST payable', { step: 50, title: 'Net GST payable', text: 'Output minus input — the single figure you remit. Owner-critical.' }, 3000)
  await callout(page, 'text=Month', { step: 51, title: 'Monthly breakdown', text: 'The same figures month by month, so filing is copy-and-go.' })

  // ═══ SCREEN 8 — Settings (owner-only NQRC Payment QR, NEW) ═══════════════
  await page.goto('/pos/settings')
  await page.getByText('Payment QR (Bhutan NQRC)').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 8 · Settings',
    title: 'Set up your payment QR',
    sub: 'Owner-only: register your bank QR so customers scan and pay at checkout. NEW.',
  }, { hold: 2600 })
  await callout(page, 'text=Payment QR (Bhutan NQRC)', { step: 52, title: 'Payment QR', text: 'A Bhutan NQRC merchant QR — these are your bank details, so only the owner sees it.' })
  await callout(page, 'text=Show a payment QR for online payments', { step: 53, title: 'Turn it on', text: 'Tick to switch the QR on for every online payment.' })
  // Idempotent: ensure the toggle ends CHECKED (it may already be on from setup), which reveals the
  // merchant fields. A plain click would toggle it OFF and hide them.
  await page.locator('label:has-text("Show a payment QR for online payments") input[type="checkbox"]').check().catch(() => {}); await beat(page, 900)

  await callout(page, 'input[placeholder="Registered with your bank"]', { step: 54, title: 'Merchant / account no.', text: 'The account number your bank registered for you.' })
  await page.getByPlaceholder('Registered with your bank').fill('100200300400').catch(() => {})
  await callout(page, 'input[placeholder="From your bank / RMA"]', { step: 55, title: 'PSP / scheme GUID', text: 'Identifies the NQRC scheme on the Bhutan Financial Switch — from your bank.' })
  await page.getByPlaceholder('From your bank / RMA').fill('BFS.PELBU.MERCHANT').catch(() => {})
  await page.getByPlaceholder('Thimphu').fill('Thimphu').catch(() => {})
  await page.getByPlaceholder('e.g. 5411').fill('5411').catch(() => {}); await beat(page)

  await callout(page, 'button:has-text("Save Changes")', { step: 56, title: 'Save', text: 'Save it once — the QR now appears automatically on every online sale.' })
  await page.getByRole('button', { name: /save changes/i }).click()
  await page.getByText('Settings saved').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await caption(page, { step: 57, title: 'Payment QR ready', text: 'Saved. Back to the till to ring up an online sale and watch it appear.' }, 2400)

  // ═══ FINALE — ONLINE checkout showing the three NEW payment features ══════
  // Full page load so the QR component re-reads the just-saved merchant config.
  await page.goto('/pos')
  await page.locator('button[title="Select customer (F6)"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Finale · Online checkout',
    title: 'Scan · scan · done',
    sub: 'The payment QR, the receipt scanner and the journal field — all in order.',
  }, { hold: 2800 })

  await caption(page, { step: 58, title: 'Add an item', text: 'Press F3 and drop a product into the cart.' })
  await addProduct(page, 'Druk')

  await caption(page, { step: 59, title: 'Tender the sale', text: 'Press F10 to open payment, then choose Online.' })
  await page.keyboard.press('F10'); await beat(page)
  const pay = page.locator('.fixed.inset-0').last()
  await pay.getByRole('heading', { name: 'Payment' }).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await callout(page, 'text=Payment Method', { step: 60, title: 'Payment methods', text: 'Online, Cash or Credit — keys 1, 2, 3. Pick Online.' })
  await pay.getByRole('button', { name: /online/i }).click(); await beat(page, 1200)

  // (1) The dynamic NQRC payment QR.
  await pay.locator('img[alt="Scan to pay"]').waitFor({ timeout: 6000 }).catch(() => {})
  await callout(page, 'img[alt="Scan to pay"]', { step: 61, title: '1 · Payment QR', text: 'The QR you just set up — the customer scans it and the exact amount is pre-filled.' }, 3200)

  // (2) The "Scan receipt" OCR camera button.
  await callout(page, 'button:has-text("Scan receipt")', { step: 62, title: '2 · Scan receipt', text: 'Point the camera at their confirmation screen and it reads the journal number for you.' }, 3000)

  // (3) The journal-number field.
  await callout(page, 'input[placeholder="Enter journal number"]', { step: 63, title: '3 · Journal number', text: 'Type it in or let the scan fill it — the reference is stored on the sale.' })
  const journal = pay.getByPlaceholder('Enter journal number')
  await journal.click()
  await journal.pressSequentially('MB2026071012345', { delay: 90 }); await beat(page, 1200)

  await caption(page, { step: 64, title: 'Complete', text: 'Press Enter, or tap Complete — the receipt is ready to print or send.' })
  const complete = pay.getByRole('button', { name: /complete/i })
  await expect(complete).toBeEnabled()
  await complete.click(); await beat(page, 2600)

  await caption(page, { step: 65, title: 'That is the whole shop', text: 'Sale done. Every console, the GST report and the payment QR — all yours.' }, 3400)
  await clearCaption(page); await clearHighlight(page); await beat(page, 900)
})
