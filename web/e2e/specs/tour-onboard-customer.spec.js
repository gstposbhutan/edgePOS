const { test } = require('@playwright/test')
const { installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat } = require('../lib/tour-overlay')

// GUIDED TOUR — Customer onboarding on the Pelbu marketplace.
//
// This is the "explain every screen's component" tour: on each screen we FIRST spotlight and
// describe the pieces of the UI (nav, bell, search, cards, panels, buttons, totals) with callout(),
// THEN walk the buying flow. Overlays (title card + captions + spotlights) are baked into the video.
//
// Browsing /shop is public, but the cart + checkout + order history need a login — so we run under a
// signed-in session (same approach as tour-customer.spec.js).
test.use({ storageState: 'e2e/storage/manager-auth.json' })

async function slowType(loc, text, delay = 55) { await loc.click(); await loc.pressSequentially(text, { delay }) }

test('TOUR — Customer onboarding: browse, cart, checkout, and track an order', async ({ page }) => {
  test.setTimeout(320_000)
  await installTour(page)

  // ── Tour intro ──────────────────────────────────────────────────────────
  await page.goto('/shop')
  await page.getByRole('button', { name: /add to cart/i }).first().waitFor({ state: 'visible', timeout: 20000 })
  await titleCard(page, {
    kicker: 'CUSTOMER · MARKETPLACE',
    title: 'Welcome to Pelbu',
    sub: 'Shop local Bhutanese stores, order in a few taps, and track it to your door.',
  })

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — The marketplace home  (/shop)
  // ════════════════════════════════════════════════════════════════════════
  await titleCard(page, { kicker: 'SCREEN 1', title: 'The marketplace', sub: 'Everything for sale, across every featured shop.' }, { hold: 2000 })

  await callout(page, 'nav', { step: 1, title: 'Pelbu top bar', text: 'The logo takes you home; the links reach the marketing pages. This bar rides along every marketplace screen.' })
  await callout(page, 'button[title="Notifications"]', { step: 2, title: 'Notification bell', text: 'Order updates land here — a red dot means something new, like "your order was dispatched".' })
  await callout(page, 'input[placeholder="Search products..."]', { step: 3, title: 'Search', text: 'Type to filter every product on the marketplace by name — instantly, as you type.' })
  await callout(page, 'header button:has(svg.lucide-shopping-bag)', { step: 4, title: 'Your cart', text: 'Your basket lives here. The red badge counts the items waiting to be checked out.' })
  await callout(page, 'header button:has(svg.lucide-user)', { step: 5, title: 'Account menu', text: 'Open this for My Orders, email-alert settings, and sign out.' })

  await callout(page, 'text=Shop from Local Stores', { step: 6, title: 'Featured shops', text: 'A hand-picked row of Pelbu stores. Scroll it sideways, or tap a shop to see only its products.' })
  await callout(page, 'a[href^="/shop/"]', { step: 7, title: 'A shop card', text: 'Each card is one store — tap it to open that store\'s own front page.' })

  await callout(page, 'main .grid', { step: 8, title: 'Product grid', text: 'Below the shops, every product from every store, newest first.' })
  await callout(page, 'main .grid > div', { step: 9, title: 'A product card', text: 'One card per item: photo, the store badge, price with GST, and stock warnings.' })
  await callout(page, 'main .grid .text-primary', { step: 10, title: 'Price', text: 'Shown in Ngultrum (Nu.) — the 5% GST is already included in what you see.' })
  await callout(page, 'button:has-text("Add to Cart")', { step: 11, title: 'Quick add', text: 'Add straight from the grid, or tap the card first to read the full details — we\'ll do that next.' })

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — A vendor storefront  (/shop/[id])
  // ════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 12, title: 'Open a shop', text: 'Tap a featured shop to visit its storefront.' })
  const storeCard = page.locator('a[href^="/shop/"]').first()
  await storeCard.scrollIntoViewIfNeeded()
  await storeCard.click()
  await page.waitForURL(/\/shop\/[0-9a-f-]{8,}/i, { timeout: 20000 })
  await page.getByRole('button', { name: /add to cart/i }).first().waitFor({ state: 'visible', timeout: 20000 })
  await clearHighlight(page)

  await titleCard(page, { kicker: 'SCREEN 2', title: 'The storefront', sub: 'One store, all of its products in one place.' }, { hold: 2000 })

  await callout(page, 'header button:has(svg.lucide-arrow-left)', { step: 13, title: 'Back', text: 'The arrow returns you to the full marketplace whenever you want to browse other shops.' })
  await callout(page, 'h1', { step: 14, title: 'Store banner', text: 'The store name up top, with its TPN (tax number) and WhatsApp contact — proof it\'s a registered Pelbu seller.' })
  await callout(page, 'input[placeholder^="Search"]', { step: 15, title: 'Search this store', text: 'The search here is scoped — it filters only this store\'s shelves.' })
  await callout(page, 'main .grid > div', { step: 16, title: 'This store\'s products', text: 'Same familiar cards — tap one to open its details.' })

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — Product detail modal
  // ════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 17, title: 'Open a product', text: 'Tap a product to see everything about it.' })
  await page.locator('main .grid h3').first().click()
  await page.locator('button:has-text("Add to Cart - Nu")').first().waitFor({ state: 'visible', timeout: 10000 })
  await beat(page, 600)

  await titleCard(page, { kicker: 'SCREEN 3', title: 'Product details', sub: 'The full picture before you add it to the cart.' }, { hold: 2000 })

  await callout(page, '.max-w-lg .aspect-square', { step: 18, title: 'Product photo', text: 'A large image, plus a stock badge in the corner — In Stock, Only-N-left, or Out of Stock.' })
  await callout(page, '.max-w-lg h1', { step: 19, title: 'Name & tags', text: 'The full product name, with condition, brand and category chips underneath.' })
  await callout(page, '.max-w-lg .text-primary', { step: 20, title: 'Price', text: 'The GST-inclusive price and its unit (per piece, per kg, and so on).' })
  await callout(page, 'text=/Sold by/', { step: 21, title: 'Seller', text: 'Which store fulfils this item — and its tax number.' })
  await callout(page, 'text=/5% \\(Included\\)/', { step: 22, title: 'Tax & specs', text: 'GST is spelled out here, alongside SKU, HSN code, specifications and any note from the store.' })
  await callout(page, 'button:has-text("Add to Cart - Nu")', { step: 23, title: 'Add to cart', text: 'Tap to drop it in your basket — the modal closes and the cart badge ticks up.' })

  await page.locator('button:has-text("Add to Cart - Nu")').first().click()
  await beat(page, 900)

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Cart drawer
  // ════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 24, title: 'Open the cart', text: 'Tap the bag in the header to review your basket.' })
  await page.locator('header button:has(svg.lucide-shopping-bag)').first().click()
  await page.getByText('Your Cart').waitFor({ state: 'visible', timeout: 10000 })
  await beat(page, 700)

  await titleCard(page, { kicker: 'SCREEN 4', title: 'Your cart', sub: 'Grouped by store, priced live, ready to check out.' }, { hold: 2000 })

  await callout(page, 'text=Your Cart', { step: 25, title: 'Cart header', text: 'The slide-in drawer shows how many items are in your basket.' })
  await callout(page, '[class*="md:w-96"] .lucide-store', { step: 26, title: 'Grouped by store', text: 'Items are split per store — each store becomes its own order at checkout.' })
  await callout(page, 'button:has(svg.lucide-plus)', { step: 27, title: 'Adjust quantity', text: 'Use plus and minus to change how many you want — the line total updates instantly.' })
  await callout(page, 'button:has(svg.lucide-trash-2)', { step: 28, title: 'Remove', text: 'The bin icon takes an item out of the cart entirely.' })
  await callout(page, 'text=/GST \\(5%\\)/', { step: 29, title: 'Running totals', text: 'Subtotal, the 5% GST, and the grand total — all recalculated as you edit.' })

  await caption(page, { step: 30, title: 'Bump the quantity', text: 'Tap plus to add one more — watch the total climb.' })
  await page.locator('button:has(svg.lucide-plus)').first().click()
  await beat(page, 900)

  await callout(page, 'button:has-text("Checkout")', { step: 31, title: 'Checkout', text: 'When you\'re happy, this takes you to the checkout screen.' })
  await page.getByRole('button', { name: /checkout/i }).click()
  await page.waitForURL('**/shop/checkout**', { timeout: 20000 })
  await page.getByPlaceholder(/enter your full delivery address/i).waitFor({ state: 'visible', timeout: 15000 })
  await clearHighlight(page)

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Checkout  (/shop/checkout)
  // ════════════════════════════════════════════════════════════════════════
  await titleCard(page, { kicker: 'SCREEN 5', title: 'Checkout', sub: 'Confirm the order, say where it goes, and place it.' }, { hold: 2000 })

  await callout(page, 'h1', { step: 32, title: 'Checkout header', text: 'You\'re on the final screen — the item count sits on the right.' })
  await callout(page, 'text=/Store subtotal/', { step: 33, title: 'Order summary', text: 'Each store\'s items and its subtotal, laid out so you can double-check before paying.' })
  await callout(page, 'text=/Subtotal \\(ex-GST\\)/', { step: 34, title: 'Grand total', text: 'The ex-GST subtotal, the 5% GST, and the final amount — collected after delivery.' })
  await callout(page, 'textarea', { step: 35, title: 'Delivery address', text: 'For delivery orders this is required — type where the rider should bring it.' })
  await callout(page, 'button:has-text("Use my current location")', { step: 36, title: 'Use GPS', text: 'Or tap this to drop your exact coordinates, so the rider finds you faster.' })
  await callout(page, 'text=/pay after delivery/i', { step: 37, title: 'Pay after delivery', text: 'No card upfront — you settle up over WhatsApp once the order arrives.' })

  await caption(page, { step: 38, title: 'Enter the address', text: 'Type your delivery address, then place the order.' })
  await slowType(page.getByPlaceholder(/enter your full delivery address/i), 'Changzamtog, Thimphu — near the swimming pool, blue gate', 45)
  await beat(page, 700)

  await callout(page, 'button:has-text("Place Order")', { step: 39, title: 'Place the order', text: 'One tap sends a separate order to each store in your cart.' })
  await page.getByRole('button', { name: /place order/i }).click()
  await page.waitForURL('**/shop/orders**', { timeout: 25000 })
  await clearHighlight(page)

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 6 — My Orders  (/shop/orders)
  // ════════════════════════════════════════════════════════════════════════
  await page.locator('a[href^="/shop/orders/"]').first().waitFor({ state: 'visible', timeout: 15000 })
  await titleCard(page, { kicker: 'SCREEN 6', title: 'My Orders', sub: 'Every order you\'ve placed, and where each one stands.' }, { hold: 2000 })

  await callout(page, 'h1', { step: 40, title: 'My Orders', text: 'Reach this any time from the account menu — it lists all your orders.' })
  await callout(page, 'text=/placed successfully/i', { step: 41, title: 'Confirmation', text: 'A green banner confirms the order went through, with its order number.' })
  await callout(page, 'button:has-text("Active")', { step: 42, title: 'Filter tabs', text: 'Filter by stage — Active, Awaiting Payment, Completed, or Cancelled.' })
  await callout(page, 'a[href^="/shop/orders/"]', { step: 43, title: 'An order card', text: 'Each card shows the order number, its status badge, the store, and the total. Tap to open it.' })

  await caption(page, { step: 44, title: 'Open the order', text: 'Tap your new order to track it in detail.' })
  await page.locator('a[href^="/shop/orders/"]').first().click()
  await page.getByText('Order Timeline').waitFor({ state: 'visible', timeout: 20000 })
  await clearHighlight(page)

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN 7 — Order tracking  (/shop/orders/[id])
  // ════════════════════════════════════════════════════════════════════════
  await titleCard(page, { kicker: 'SCREEN 7', title: 'Track your order', sub: 'Status, delivery, items, and a live timeline.' }, { hold: 2000 })

  await callout(page, 'header p.font-semibold', { step: 45, title: 'Order header', text: 'The order number, its live status badge, and the amount due — pinned to the top.' })
  await callout(page, 'text=/delivery rider/i', { step: 46, title: 'Dispatch status', text: 'While we assign a rider you\'ll see this. If none are free, you can cancel from right here.' })
  await callout(page, 'text=Sold by', { step: 47, title: 'Seller & address', text: 'Which store is fulfilling the order, and the delivery address you entered.' })
  await callout(page, 'text=/Items \\(/', { step: 48, title: 'Items & total', text: 'A full receipt of what you ordered, with GST and the grand total.' })
  await callout(page, 'text=Order Timeline', { step: 49, title: 'Live timeline', text: 'Every step — Confirmed, Processing, Dispatched, Delivered — stamped with the time it happened.' })
  await callout(page, 'button:has-text("Cancel order")', { step: 50, title: 'Cancel', text: 'Before a rider is on the way you can still cancel the order here.' })

  await caption(page, { step: 51, title: 'At your door', text: 'When the rider arrives, a delivery OTP appears here — read it out to confirm handover.' }, 2600)
  await caption(page, { step: 52, title: 'Then pay', text: 'Once delivered, a Pay Now button opens the payment screen — upload your mBoB or mPay screenshot and it\'s verified on the spot.' }, 2600)

  // ── Closing ───────────────────────────────────────────────────────────────
  await clearHighlight(page)
  await titleCard(page, {
    kicker: 'CUSTOMER · MARKETPLACE',
    title: 'That\'s Pelbu',
    sub: 'Browse, add to cart, check out, and track — all the way to your door.',
  }, { hold: 3200 })
  await clearCaption(page); await beat(page, 800)
})
