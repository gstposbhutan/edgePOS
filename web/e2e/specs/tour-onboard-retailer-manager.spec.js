const { test, expect } = require('@playwright/test')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// ─────────────────────────────────────────────────────────────────────────────
// GUIDED TOUR — RETAILER · MANAGER onboarding (delta tour).
//
// The manager runs the shop day-to-day but is NOT the owner: their left rail shows
// everything EXCEPT Team, Stores and the Desktop-App download (all OWNER-only). This
// tour first names every nav item the manager DOES see, calls out the three that are
// hidden, then dives — with heavy component callouts — into the manager's daily work:
// Inventory, Purchases (PO → PI → receive), Khata, Shifts (open / close / reconcile)
// and the GST Report. It closes with a quick ONLINE checkout to show the payment QR,
// the receipt scanner and the journal-number field.
//
// The full Register / top-bar walkthrough is intentionally NOT repeated here — that is
// covered exhaustively in tour-onboard-retailer-owner.spec.js; this tour just anchors
// a couple of register components and points there.
//
// Signed in as the RETAILER MANAGER (manager@nexus.bt, sub_role MANAGER). Slow-paced
// via the `tour` project's slowMo + overlay holds. Author-only: not run/recorded here.
// ─────────────────────────────────────────────────────────────────────────────
test.use({ storageState: 'e2e/storage/manager-auth.json' }) // RETAILER MANAGER

// Add a product from the F3 keyboard search — reused for the closing ONLINE checkout.
async function addProduct(page, query = 'Druk') {
  await page.keyboard.press('F3'); await beat(page)
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  const search = modal.locator('[data-testid="keyboard-product-search-input"]')
  await search.click()
  await search.pressSequentially(query, { delay: 150 }); await beat(page)
  await modal.locator('table tbody tr').first().click(); await beat(page, 1400)
}

test('TOUR — Manager: day-to-day console + shifts + GST report + online checkout', async ({ page }) => {
  test.setTimeout(500_000)
  await installTour(page)

  // ═══ Tour intro ══════════════════════════════════════════════════════════
  await page.goto('/pos')
  await page.locator('header button[title="Select customer (F6)"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Retailer · Manager',
    title: 'Run the floor',
    sub: 'A manager sees almost every screen the owner does. Here is your day-to-day.',
  }, { hold: 3200 })

  // ═══ SCREEN 1 — The rail: what a manager sees (and does not) ═════════════
  await titleCard(page, {
    kicker: 'Screen 1 · The rail',
    title: 'Your side menu',
    sub: 'Nearly the full owner menu — with three owner-only screens held back.',
  }, { hold: 2400 })

  // Expand the collapsed rail so labels are visible while we point at each item.
  const expandBtn = page.locator('button[title="Expand"]')
  if (await expandBtn.count()) { await expandBtn.first().click(); await beat(page, 900) }

  // ── Every nav item the MANAGER sees ──────────────────────────────────────
  await callout(page, 'aside a[href="/pos"]', { step: 1, title: 'Register', text: 'The till — search products, build the cart and take payment. You start here.' })
  await callout(page, 'aside a[href="/pos/orders"]', { step: 2, title: 'Orders', text: 'Every sale, online order and quotation — reprint, cancel or refund from here.' })
  await callout(page, 'aside a[href="/pos/products"]', { step: 3, title: 'Products', text: 'The catalogue — add items, set prices and HSN codes, build bundles.' })
  await callout(page, 'aside a[href="/pos/inventory"]', { step: 4, title: 'Inventory', text: 'Live stock levels, batches, movement history and low-stock alerts.' })
  await callout(page, 'aside a[href="/pos/purchases"]', { step: 5, title: 'Purchases', text: 'Buy-side: raise purchase orders and receive them to restock the shelf.' })
  await callout(page, 'aside a[href="/pos/khata"]', { step: 6, title: 'Khata', text: 'Credit ledgers — who owes you, their limit and their running balance.' })
  await callout(page, 'aside a[href="/pos/registers"]', { step: 7, title: 'Cash Registers', text: 'Your physical tills and terminals, each with its own opening float.' })
  await callout(page, 'aside a[href="/pos/shifts"]', { step: 8, title: 'Shifts', text: 'Closed cashier shifts with the drawer count and any variance. You get this.' })
  await callout(page, 'aside a[href="/pos/reports"]', { step: 9, title: 'GST Report', text: 'Output tax, input credit and net GST payable — the monthly filing figures.' })
  await callout(page, 'aside a[href="/pos/settings"]', { step: 10, title: 'Settings', text: 'Business profile and storefront. The payment-QR setup inside is owner-only.' })

  // ── The three OWNER-ONLY screens the manager does NOT get ─────────────────
  await caption(page, {
    step: 11, title: 'Not on your rail',
    text: 'Team, Stores and the Desktop-App download are owner-only — you will not see them here.',
  }, 3400)

  // ── Anchor a couple of register components, then defer the full walkthrough ─
  await caption(page, { step: 12, title: 'The register', text: 'Same till as the owner — the full walkthrough lives in the Owner tour.' }, 2200)
  await callout(page, 'header button[title="Select customer (F6)"]', { step: 13, title: 'Customer (F6)', text: 'Attach a customer for khata credit and a digital receipt.' })
  await callout(page, 'header button:has-text("Shift")', { step: 14, title: 'Shift badge', text: 'Open your shift here to count the drawer; closing it triggers the reconcile.' })

  // ═══ SCREEN 2 — Inventory ════════════════════════════════════════════════
  await page.goto('/pos/inventory')
  await page.getByRole('heading', { name: 'Inventory' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 2 · Inventory',
    title: 'Stock, live',
    sub: 'Levels, batches and every movement — your daily shelf check.',
  }, { hold: 2200 })
  await callout(page, '[data-testid="inventory-tabs"]', { step: 15, title: 'Views', text: 'Stock levels, batches, draft purchases, demand predictions and a full movement log.' })
  await callout(page, '[data-testid="low-stock-banner"], [data-testid="out-of-stock-banner"]', { step: 16, title: 'Stock alerts', text: 'Low- and out-of-stock items surface up top so you can reorder before you run dry.' })
  await callout(page, 'text=Stock Levels', { step: 17, title: 'Stock table', text: 'Every item with its on-hand quantity — adjust it here when you count the shelf.' })

  // ═══ SCREEN 3 — Purchases (PO → PI → receive) ════════════════════════════
  await page.goto('/pos/purchases')
  await page.getByRole('heading', { name: 'Purchases' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 3 · Purchases',
    title: 'Restock from suppliers',
    sub: 'Raise an order, receive it as an invoice, and stock lands on its own.',
  }, { hold: 2400 })
  await callout(page, 'button:has-text("Purchase Orders")', { step: 18, title: '1 · Purchase Orders', text: 'What you have ordered from a supplier but not yet received.' })
  await callout(page, 'button:has-text("Purchase Invoices")', { step: 19, title: '2 · Purchase Invoices', text: 'Received goods — confirming an invoice restocks the catalogue automatically.' })
  await callout(page, 'button:has-text("New PO")', { step: 20, title: '3 · New PO', text: 'Start a fresh order: pick a supplier, add the lines, then receive it later.' }, 3000)

  // ═══ SCREEN 4 — Khata (credit ledgers) ═══════════════════════════════════
  await page.goto('/pos/khata')
  await page.getByRole('heading', { name: /Khata/i }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 4 · Khata',
    title: 'Credit ledgers',
    sub: 'The traditional shop khata — who owes you, and how much room they have left.',
  }, { hold: 2200 })
  await callout(page, 'input[placeholder="Search by name or phone..."]', { step: 21, title: 'Find a customer', text: 'Look up any credit account by name or phone number.' })
  await callout(page, '[data-testid="khata-account-row"]', { step: 22, title: 'Account', text: 'Each row shows the outstanding balance against the credit limit the owner set.' }, 3000)

  // ═══ SCREEN 5 — Shifts (open / close / reconcile) ════════════════════════
  await page.goto('/pos/shifts')
  await page.getByText('Shift History').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 5 · Shifts',
    title: 'Drawer accountability',
    sub: 'Open from the register, close from the register, reconcile here.',
  }, { hold: 2400 })
  await caption(page, { step: 23, title: 'Open & close', text: 'You open and close a shift from the register Shift badge — closing it counts the drawer.' }, 2600)
  await callout(page, 'text=Shift History', { step: 24, title: 'Closed shifts', text: 'A history of every drawer session your cashiers have run.' })
  await callout(page, 'text=Expected', { step: 25, title: 'Expected', text: 'Opening float plus cash sales minus pay-outs — what the drawer should hold.' })
  await callout(page, 'text=Counted', { step: 26, title: 'Counted', text: 'What the cashier actually counted at close.' })
  await callout(page, 'text=Variance', { step: 27, title: 'Variance', text: 'Counted minus expected — how you catch a short or over drawer at a glance.' }, 3000)

  // ═══ SCREEN 6 — GST Report (same components as the owner) ═════════════════
  await page.goto('/pos/reports')
  await page.getByRole('heading', { name: 'GST Report' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Screen 6 · GST Report',
    title: 'Your tax, done',
    sub: 'The same report the owner reads — output tax, input credit and net payable.',
  }, { hold: 2600 })
  await page.getByText('Net GST payable').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await callout(page, 'input[type="date"] >> nth=0', { step: 28, title: 'Date range', text: 'Pick the period — a month for filing, a year for the full picture.' })
  await callout(page, 'text=Taxable sales', { step: 29, title: 'Taxable vs exempt', text: 'Turnover split into taxable sales and GST-exempt sales.' })
  await callout(page, 'text=Output GST', { step: 30, title: 'Output GST', text: 'The 5% GST you collected on sales — what the shop owes.' })
  await callout(page, 'text=Input GST (ITC)', { step: 31, title: 'Input GST (ITC)', text: 'GST paid on platform purchases — credit that offsets what you owe.' })
  await callout(page, 'text=Net GST payable', { step: 32, title: 'Net GST payable', text: 'Output minus input — the single figure the shop remits.' }, 3000)
  await callout(page, 'text=Month', { step: 33, title: 'Monthly breakdown', text: 'The same figures month by month, so filing is copy-and-go.' })

  // ═══ FINALE — quick ONLINE checkout (QR · scan receipt · journal) ═════════
  await page.goto('/pos')
  await page.locator('header button[title="Select customer (F6)"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await titleCard(page, {
    kicker: 'Finale · Online checkout',
    title: 'Scan · scan · done',
    sub: 'Take an online payment — the QR, the receipt scanner and the journal field.',
  }, { hold: 2800 })

  await caption(page, { step: 34, title: 'Add an item', text: 'Press F3, type a name, pick the match — it drops into the cart.' })
  await addProduct(page, 'Druk')

  await caption(page, { step: 35, title: 'Tender the sale', text: 'Press F10 to open payment, then choose Online.' })
  await page.keyboard.press('F10'); await beat(page)
  const pay = page.locator('.fixed.inset-0').last()
  await pay.getByRole('heading', { name: 'Payment' }).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await callout(page, 'text=Payment Method', { step: 36, title: 'Payment methods', text: 'Online, Cash or Credit — keys 1, 2, 3. Pick Online.' })
  await pay.getByRole('button', { name: /online/i }).click(); await beat(page, 1200)

  // (1) The dynamic NQRC payment QR (set up by the owner in Settings).
  await pay.locator('img[alt="Scan to pay"]').waitFor({ timeout: 6000 }).catch(() => {})
  await callout(page, 'img[alt="Scan to pay"]', { step: 37, title: '1 · Payment QR', text: 'The shop NQRC QR — the customer scans it and the exact amount is pre-filled.' }, 3200)

  // (2) The "Scan receipt" OCR camera button.
  await callout(page, 'button:has-text("Scan receipt")', { step: 38, title: '2 · Scan receipt', text: 'Point the camera at their confirmation screen and it reads the journal number for you.' }, 3000)

  // (3) The journal-number field.
  await callout(page, 'input[placeholder="Enter journal number"]', { step: 39, title: '3 · Journal number', text: 'Type it in or let the scan fill it — the reference is stored on the sale.' })
  const journal = pay.getByPlaceholder('Enter journal number')
  await journal.click()
  await journal.pressSequentially('MB2026071012345', { delay: 90 }); await beat(page, 1200)

  await caption(page, { step: 40, title: 'Complete', text: 'Press Enter, or tap Complete — the receipt is ready to print or send.' })
  const complete = pay.getByRole('button', { name: /complete/i })
  await expect(complete).toBeEnabled()
  await complete.click(); await beat(page, 2600)

  await caption(page, { step: 41, title: 'That is your day', text: 'Stock, purchases, khata, shifts and the GST report — the manager runs it all.' }, 3400)
  await clearCaption(page); await clearHighlight(page); await beat(page, 900)
})
