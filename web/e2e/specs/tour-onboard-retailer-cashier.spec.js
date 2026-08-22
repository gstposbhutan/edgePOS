const { test, expect } = require('@playwright/test')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// ─────────────────────────────────────────────────────────────────────────────
// GUIDED TOUR — RETAILER · CASHIER onboarding.
//
// The till operator's tour. A cashier's world is deliberately small: the left
// sidebar shows ONLY Register and Orders — every back-office screen (Products,
// Inventory, Purchases, Khata, Reports, Team, Settings …) is hidden. So this tour
// goes DEEP on the two screens the cashier actually uses, explaining every
// component before ringing sales:
//   • Register — sidebar, top-bar actions, the keyboard shortcut map, the cart
//     line, the live totals — then a full CASH sale, then an ONLINE sale that
//     surfaces the three NEW checkout features in order: the NQRC payment QR →
//     "Scan receipt" OCR → the journal-number field.
//   • Orders — the cashier's POS-only order list, for reprints and lookups.
//
// Signed in as the RETAILER CASHIER (till operator, restricted access). Slow-paced
// via the `tour` project's slowMo + the overlay holds. Author-only: not run here.
// ─────────────────────────────────────────────────────────────────────────────
test.use({ storageState: 'e2e/storage/cashier-auth.json' })   // RETAILER CASHIER

// Add a product from the F3 keyboard search — reused for the cash and online sales.
async function addProduct(page, query = 'Druk') {
  await page.keyboard.press('F3'); await beat(page)
  const modal = page.locator('[data-testid="keyboard-product-search-modal"]')
  const search = modal.locator('[data-testid="keyboard-product-search-input"]')
  await search.click()
  await search.pressSequentially(query, { delay: 150 }); await beat(page)
  await modal.locator('table tbody tr').first().click(); await beat(page, 1400)
}

// Dismiss the post-sale receipt preview back to an empty till (New Sale button, or Esc).
async function newSale(page) {
  const newSaleBtn = page.getByRole('button', { name: /new sale/i })
  if (await newSaleBtn.isVisible().catch(() => false)) { await newSaleBtn.click() }
  else { await page.keyboard.press('Escape') }
  await beat(page, 1000)
}

test('TOUR — Cashier: the register, a cash sale + an online (NQRC) sale', async ({ page }) => {
  test.setTimeout(600_000)
  await installTour(page)

  // ═══ Tour intro ══════════════════════════════════════════════════════════
  await page.goto('/pos')
  await expect(page.locator('header button[title="Select customer (F6)"]')).toBeVisible({ timeout: 20000 })
  await titleCard(page, {
    kicker: 'Retailer · Cashier',
    title: 'Behind the till',
    sub: 'The cashier sees just two screens — the Register and Orders. Let us master both.',
  }, { hold: 3200 })

  // ═══ SCREEN 1 — The Register + the (short) sidebar ═══════════════════════
  await titleCard(page, {
    kicker: 'Screen 1 · Register',
    title: 'This is your whole job',
    sub: 'Ring sales, take payment, reprint a receipt. Everything else is hidden.',
  }, { hold: 2200 })

  // Expand the collapsed rail so the labels show while we name each item.
  const expandBtn = page.locator('button[title="Expand"]')
  if (await expandBtn.count()) { await expandBtn.first().click(); await beat(page, 900) }

  // ── The sidebar — deliberately just TWO items for a cashier ───────────────
  await callout(page, 'aside nav', { step: 1, title: 'Your sidebar', text: 'A cashier gets exactly two screens. No catalogue, no stock, no reports — nothing to get lost in.' }, 3000)
  await callout(page, 'aside a[href="/pos"]', { step: 2, title: 'Register', text: 'The till itself — search products, build the cart and take payment. You live here.' })
  await callout(page, 'aside a[href="/pos/orders"]', { step: 3, title: 'Orders', text: 'Every sale you have rung — look one up and reprint its receipt. That is the whole menu.' })
  await caption(page, { step: 4, title: 'Everything else is hidden', text: 'Products, Inventory, Purchases, Khata, Reports, Team, Settings — all owner/manager screens. Not your worry.' }, 2600)

  // ── Register top bar — the action strip ──────────────────────────────────
  await caption(page, { step: 5, title: 'The top bar', text: 'The header carries register actions only — navigation lives in the rail you just saw.' }, 1900)
  await callout(page, 'header button[title="Select customer (F6)"]', { step: 6, title: 'Customer (F6)', text: 'Attach a customer to the sale — for a digital receipt or a credit (khata) purchase. Blank means walk-in.' })
  await callout(page, 'header button[title^="Next invoice number"]', { step: 7, title: 'Next invoice no.', text: 'A live preview of the number the next sale will carry. Double-click it to search past invoices.' })
  await callout(page, 'header button[title="Invoice date (server time)"]', { step: 8, title: 'Invoice date', text: 'The internet clock stamped on each sale — always accurate, and you cannot change it.' })
  await callout(page, 'header button[title="Notifications"]', { step: 9, title: 'Notifications', text: 'A bell for in-app alerts — new online orders, low-stock notices and the like.' })
  await callout(page, 'header button[title="Switch to Touch Mode"]', { step: 10, title: 'Touch mode', text: 'Prefer taps over keys? Flip to the big-button touch layout — same till, same sale.' })
  await callout(page, 'header button:has-text("Shift")', { step: 11, title: 'Shift badge', text: 'Open a shift to count your drawer at start and end. Selling works with or without one.' })
  await callout(page, 'header button[title="Sign out"]', { step: 12, title: 'Sign out', text: 'Log off. If a shift is open it prompts you to close it or hand the register to a teammate first.' })

  // ── Shortcut bar — the keyboard map (the cashier's real interface) ────────
  await caption(page, { step: 13, title: 'The keyboard map', text: 'Every till action has a function key. You almost never need the mouse — learn these six.' }, 2200)
  await callout(page, 'button[title^="F3"]', { step: 14, title: 'F3 · Search', text: 'Open product search — or just start typing a name to jump straight in.' })
  await callout(page, 'button[title^="F6"]', { step: 15, title: 'F6 · Customer', text: 'Pick the customer for this sale, same as the badge in the header.' })
  await callout(page, 'button[title^="F8"]', { step: 16, title: 'F8 · Sales Person', text: 'Tag the selected line to whoever sold it — for commission tracking.' })
  await callout(page, 'button[title^="F9"]', { step: 17, title: 'F9 · Change Qty', text: 'Edit the quantity of the selected line without re-adding it.' })
  await callout(page, 'button[title^="Ctrl+M"]', { step: 18, title: 'Ctrl+M · Row discount', text: 'Discount a single line. Ctrl+D discounts the whole bill (before GST).' })
  await callout(page, 'button[title^="F10"]', { step: 19, title: 'F10 · Tender', text: 'The big one — F10 opens Payment to take money and finish the sale.' }, 3000)
  await callout(page, 'text=Press F3 or start typing', { step: 20, title: 'Empty cart', text: 'An empty till waits here. Add your first item and it fills up.' })

  // ── Build a cart to explain the line + totals components ──────────────────
  await caption(page, { step: 21, title: 'Add an item', text: 'Press F3, type a name, then pick the match — it drops into the cart.' })
  await addProduct(page, 'Druk')
  await callout(page, 'table tbody tr', { step: 22, title: 'Cart line', text: 'Quantity, product, stock on hand, unit price, any discount and the line total — one row per item.' }, 3000)
  await callout(page, 'text=Total: Nu.', { step: 23, title: 'Totals bar', text: 'Subtotal, any invoice discount, GST at 5% and the grand total — always live as you scan.' }, 3000)

  // ═══ CASH SALE ═══════════════════════════════════════════════════════════
  await titleCard(page, {
    kicker: 'Sale 1 · Cash',
    title: 'Take cash',
    sub: 'Tender, count the money, hand back change — the everyday sale.',
  }, { hold: 2200 })

  await caption(page, { step: 24, title: 'Tender the sale', text: 'Press F10 to open Payment.' })
  await page.keyboard.press('F10'); await beat(page)
  const pay = page.locator('.fixed.inset-0').last()
  await expect(pay.getByRole('heading', { name: 'Payment' })).toBeVisible({ timeout: 8000 })
  await callout(page, 'h2:has-text("Payment") + p', { step: 25, title: 'Amount due', text: 'The grand total the customer owes, big and clear at the top.' })
  await callout(page, 'text=Payment Method', { step: 26, title: 'Payment methods', text: 'Online, Cash or Credit — keys 1, 2, 3. Pick Cash.' })
  await pay.getByRole('button', { name: /cash/i }).click(); await beat(page, 900)

  await callout(page, 'input[type="number"]', { step: 27, title: 'Received', text: 'Type what the customer handed over — or use the shortcuts below.' })
  await callout(page, 'button:has-text("Nu.100")', { step: 28, title: 'Denominations', text: 'Tap a note to add it — Nu.10 up to Nu.1000 — for quick cash entry (Ctrl+1…5).' })
  await callout(page, 'button:has-text("Exact")', { step: 29, title: 'Exact', text: 'Customer paid the exact amount? One tap fills it. [R] rounds up to the nearest Nu.5.' })
  await pay.getByRole('button', { name: /exact/i }).click(); await beat(page, 900)
  await callout(page, 'text="Change"', { step: 30, title: 'Change due', text: 'Received minus the bill — the change to hand back. Green means enough was tendered.' })
  await callout(page, 'button:has-text("Complete")', { step: 31, title: 'Complete', text: 'Press Enter or tap Complete to finish and issue the receipt.' })
  const complete = pay.getByRole('button', { name: /complete/i })
  await expect(complete).toBeEnabled()
  await complete.click(); await beat(page, 2200)

  // ── Post-sale receipt preview ─────────────────────────────────────────────
  const saleDone = page.getByText('Sale Complete')
  if (await saleDone.isVisible().catch(() => false)) {
    await callout(page, 'text=Sale Complete', { step: 32, title: 'Receipt ready', text: 'The sale is booked with its invoice number — here is the printable receipt.' })
    await callout(page, 'button:has-text("80mm")', { step: 33, title: 'Paper width', text: 'Match your printer — 58mm or 80mm thermal roll. Set it once per till.' })
    await callout(page, 'button:has-text("Print")', { step: 34, title: 'Print', text: 'Send it to any printer — thermal, A4 or save as PDF.' })
    await callout(page, 'button:has-text("New Sale")', { step: 35, title: 'New Sale', text: 'Done — tap New Sale (or F2) to clear the till for the next customer.' })
  }
  await newSale(page)

  // ═══ ONLINE SALE — the three NEW checkout features, in order ══════════════
  await titleCard(page, {
    kicker: 'Sale 2 · Online',
    title: 'Scan · scan · done',
    sub: 'The payment QR, the receipt scanner and the journal field — all NEW.',
  }, { hold: 2800 })

  await caption(page, { step: 36, title: 'Ring another item', text: 'Press F3 and drop a product into a fresh cart.' })
  await addProduct(page, 'Druk')

  await caption(page, { step: 37, title: 'Tender · choose Online', text: 'Press F10, then pick Online (key 1) for a digital payment.' })
  await page.keyboard.press('F10'); await beat(page)
  const pay2 = page.locator('.fixed.inset-0').last()
  await expect(pay2.getByRole('heading', { name: 'Payment' })).toBeVisible({ timeout: 8000 })
  await callout(page, 'text=Payment Method', { step: 38, title: 'Payment methods', text: 'Same three methods. Tap Online to reveal the digital-payment flow.' })
  await pay2.getByRole('button', { name: /online/i }).click(); await beat(page, 1200)

  // (1) The dynamic NQRC payment QR.
  await pay2.locator('img[alt="Scan to pay"]').waitFor({ timeout: 6000 }).catch(() => {})
  await callout(page, 'img[alt="Scan to pay"]', { step: 39, title: '1 · Payment QR · NEW', text: 'A Bhutan NQRC code with the exact amount pre-filled. The customer scans it in any bank app and pays.' }, 3400)

  // (2) The "Scan receipt" OCR camera button.
  await callout(page, 'button:has-text("Scan receipt")', { step: 40, title: '2 · Scan receipt · NEW', text: 'Point the camera at their payment-confirmation screen and it reads the journal number for you.' }, 3200)

  // (3) The journal-number field.
  await callout(page, 'input[placeholder="Enter journal number"]', { step: 41, title: '3 · Journal number · NEW', text: 'Type the reference in, or let the scan fill it — it is stored on the sale as proof of payment.' })
  const journal = pay2.getByPlaceholder('Enter journal number')
  await journal.click()
  await journal.pressSequentially('MB2026071012345', { delay: 90 }); await beat(page, 1200)

  await caption(page, { step: 42, title: 'Complete', text: 'Press Enter, or tap Complete — the receipt is ready to print or send.' })
  const complete2 = pay2.getByRole('button', { name: /complete/i })
  await expect(complete2).toBeEnabled()
  await complete2.click(); await beat(page, 2400)
  await newSale(page)

  // ═══ SCREEN 2 — Orders (the cashier's POS-only list) ═════════════════════
  await page.goto('/pos/orders')
  await expect(page.getByPlaceholder(/Search by order no/i)).toBeVisible({ timeout: 15000 })
  await titleCard(page, {
    kicker: 'Screen 2 · Orders',
    title: 'Find a past sale',
    sub: 'Your second screen — look up any sale you rang, and reprint its receipt.',
  }, { hold: 2600 })

  await caption(page, { step: 43, title: 'POS orders only', text: 'For a cashier this list is just POS sales — no Sales-order tabs, no New Order button. Kept simple.' }, 2600)
  await callout(page, 'input[placeholder^="Search by order no"]', { step: 44, title: 'Search', text: 'Find a sale by invoice number or the customer’s phone.' })
  await callout(page, 'button:has-text("Completed")', { step: 45, title: 'Status filters', text: 'Narrow the list — All, Active, Completed, Cancelled or Refunds.' })
  await callout(page, '.divide-y button', { step: 46, title: 'A sale', text: 'Each row shows the invoice number, date, payment method, total and GST. This is the sale you just rang.' }, 3000)

  // Open the top sale to view its detail.
  const firstRow = page.locator('.divide-y button').first()
  if (await firstRow.isVisible().catch(() => false)) {
    await caption(page, { step: 47, title: 'Open the sale', text: 'Tap a row to open the full order — where you reprint the receipt.' })
    await firstRow.click()
    await page.waitForURL('**/pos/orders/**', { timeout: 15000 }).catch(() => {})
    await beat(page, 2400)
    await caption(page, { step: 48, title: 'The sale', text: 'The complete order — items, totals, payment and its receipt. Reprint it any time.' }, 3000)
  }

  // ═══ Finale ══════════════════════════════════════════════════════════════
  await caption(page, { step: 49, title: 'That is the till', text: 'Two screens, six keys, two ways to take money. You are ready to serve customers.' }, 3400)
  await clearCaption(page); await clearHighlight(page); await beat(page, 900)
})
