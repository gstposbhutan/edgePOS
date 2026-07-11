const { test, expect } = require('@playwright/test')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// ─────────────────────────────────────────────────────────────────────────────
// GUIDED ONBOARDING TOUR — WHOLESALER · B2B CONSOLE (the middle tier).
//
// Unlike the quick wholesaler flow tour, this one EXPLAINS EVERY SCREEN'S COMPONENTS
// first (via callout spotlights) and then walks the task. It covers the whole console —
// the full left nav (every tile), Warehouses + per-warehouse Inventory, the B2B Sell
// flow (pick a retailer → cart → rate tier → place order), Quotes & Orders, Credit /
// Khata, the NEW GST Report (output / input / net + taxable-vs-exempt) and Settings
// including the NEW owner-only NQRC Payment-QR editor.
//
// The wholesaler has NO cash POS — they hold stock in depots and supply the retailers
// below them, restocking from the distributors above. Signed in as the WHOLESALER OWNER
// (Pema Wangchuk). Slow-paced via the `tour` project's slowMo + the overlay holds.
// Author-only: not run/recorded here. Buyer/khata/order/inventory lists are toured
// defensively — callouts fall back to caption-only and click-throughs are guarded, so
// the tour narrates the same components whether or not the demo data is populated.
// ─────────────────────────────────────────────────────────────────────────────
test.use({ storageState: 'e2e/storage/wholesaler-auth.json' })

// A nav-rail link, scoped to the sidebar so it never collides with the landing tiles.
const navLink = (page, href) => page.locator(`nav a[href="${href}"]`)
const has = async (loc) => (await loc.count()) > 0

test('Wholesaler onboarding tour — every console screen explained', async ({ page }) => {
  test.setTimeout(1_200_000)
  await installTour(page)

  // ═════════════════════════════════════════════════════════════════════════
  // TOUR INTRO
  // ═════════════════════════════════════════════════════════════════════════
  await page.goto('/wholesaler')
  await expect(page.getByRole('heading', { name: 'Wholesaler Console' })).toBeVisible({ timeout: 20000 })
  await titleCard(page, {
    kicker: 'WHOLESALER · B2B CONSOLE',
    title: 'The middle of the chain',
    sub: 'You buy from distributors and supply the retailers below you. No cash till — this is a B2B console. We tour every screen.',
  }, { hold: 3400 })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 OF 8 — CONSOLE HOME + the whole left nav, tile by tile
  // ═════════════════════════════════════════════════════════════════════════
  await titleCard(page, {
    kicker: 'SCREEN 1 OF 8',
    title: 'Console home',
    sub: 'Your dashboard — the left rail is how you move around. Let us name every tile on it.',
  }, { hold: 2400 })

  // ── The header ──
  await callout(page, 'header h1:has-text("Wholesaler Console")', {
    step: 1, title: 'Who you are', text: 'Your console name and business (Pema Wangchuk) sit up here on every screen.',
  })
  await callout(page, 'header button:has-text("Sign out")', {
    step: 2, title: 'Sign out', text: 'Ends your session and returns you to the login screen.',
  })

  // ── The complete left nav (every destination the wholesaler sees) ──
  await callout(page, 'nav a[href="/wholesaler/retailers"]', {
    step: 3, title: 'Retailers', text: 'Browse every retailer on the platform and connect the ones you supply — your customer network.',
  })
  await callout(page, 'nav a[href="/wholesaler/saved"]', {
    step: 4, title: 'Saved', text: 'Your favourites — the retailers you deal with most, kept one tap away.',
  })
  await callout(page, 'nav a[href="/wholesaler/sell"]', {
    step: 5, title: 'Sell', text: 'Sell to a retailer: pick a buyer, build their cart and place the B2B order. Your day job.',
  })
  await callout(page, 'nav a[href="/wholesaler/quotes"]', {
    step: 6, title: 'Quotes & Orders', text: 'The sales orders and quotations you raised — fulfil a draft into an invoice from here.',
  })
  await callout(page, 'nav a[href="/wholesaler/orders"]', {
    step: 7, title: 'Orders', text: 'Incoming orders retailers placed with you — your inbound queue to fulfil.',
  })
  await callout(page, 'nav a[href="/wholesaler/restock"]', {
    step: 8, title: 'Order supplies', text: 'Restock from the distributors above you. This buy-up tile is the one distributors do not have.',
  })
  await callout(page, 'nav a[href="/wholesaler/warehouses"]', {
    step: 9, title: 'Warehouses', text: 'Your buildings and depots. A wholesaler holds stock in warehouses — not a shop counter.',
  })
  await callout(page, 'nav a[href="/wholesaler/inventory"]', {
    step: 10, title: 'Inventory', text: 'Stock levels per warehouse — receive, adjust, transfer, and read every movement.',
  })
  await callout(page, 'nav a[href="/wholesaler/purchases"]', {
    step: 11, title: 'Purchases', text: 'The buy-side ledger — purchase orders to suppliers and the invoices that restock you.',
  })
  await callout(page, 'nav a[href="/wholesaler/khata"]', {
    step: 12, title: 'Credit', text: 'The khata you extend to your retailers — who owes you, their limit and balance.',
  })
  await callout(page, 'nav a[href="/wholesaler/terminals"]', {
    step: 13, title: 'Terminals', text: 'The back-office desktop terminals bound to your business for offline stock work.',
  })
  await callout(page, 'nav a[href="/wholesaler/reports"]', {
    step: 14, title: 'GST Report · NEW', text: 'Output tax, input credit and net GST payable — your monthly filing, ready to read.',
  })
  await callout(page, 'nav a[href="/wholesaler/catalog"]', {
    step: 15, title: 'Catalog', text: 'The wholesale products retailers order from you, each with a rate per tier.',
  })
  await callout(page, 'nav a[href="/wholesaler/team"]', {
    step: 16, title: 'Team', text: 'Your staff logins — owners and managers add cashiers/managers here.',
  })
  await callout(page, 'nav a[href="/wholesaler/settings"]', {
    step: 17, title: 'Settings', text: 'Business profile, storefront and — for owners — your payment QR. Owner-only fields.',
  })

  // ── Sub-role note: same UI for everyone; permissions live on the server ──
  await caption(page, {
    step: 18, title: 'One UI for every sub-role',
    text: 'OWNER, MANAGER and STAFF all see this same console. Who can do what — Team, Settings, write-offs — is enforced server-side.',
  }, 3200)

  // ── The landing dashboard body ──
  await callout(page, 'div.border-dashed', {
    step: 19, title: 'Quick brief', text: 'A one-line reminder of what this console manages.',
  })
  await callout(page, 'main a[href="/wholesaler/sell"]', {
    step: 20, title: 'Tile shortcuts', text: 'The same destinations as big tiles — each shows a one-line note of what it does.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 2 OF 8 — WAREHOUSES
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 21, title: 'Open Warehouses', text: 'Tap Warehouses to manage your depots.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/warehouses').click()
  await expect(page).toHaveURL(/\/wholesaler\/warehouses/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Warehouses' })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 2 OF 8',
    title: 'Warehouses',
    sub: 'Your buildings and depots. Each has a primary flag and an active switch.',
  }, { hold: 2400 })

  await callout(page, 'h2:has-text("Warehouses")', {
    step: 22, title: 'Warehouses', text: 'Every depot you store stock in — the subtitle counts your locations.',
  })
  await callout(page, 'button[title="Refresh"]', {
    step: 23, title: 'Refresh', text: 'Reload the list if you just changed something on another device.',
  })
  await callout(page, 'button:has-text("Add Warehouse")', {
    step: 24, title: 'Add Warehouse', text: 'Register a new building or depot. Let us open the form.',
  })

  const firstWh = page.locator('div.divide-y > div').filter({ has: page.locator('svg.lucide-warehouse') }).first()
  if (await has(firstWh)) {
    await callout(page, 'div.divide-y > div:has(svg.lucide-warehouse)', {
      step: 25, title: 'A warehouse row', text: 'Name, a Primary or Inactive badge and its address. The ★, toggle, pencil and bin act on it.',
    })
  }

  // ── FLOW: open the Add-Warehouse form, explain each field, then Cancel ──
  await caption(page, { step: 26, title: 'Open the form', text: 'Tap Add Warehouse to see how a depot is defined.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: 'Add Warehouse', exact: true }).first().click(); await beat(page, 1000)

  await callout(page, 'input[placeholder="e.g. Thimphu Main Depot"]', {
    step: 27, title: 'Name', text: 'What the depot is called — e.g. Thimphu Main Depot. The only required field.',
  })
  await callout(page, 'textarea[placeholder="Building, street, town"]', {
    step: 28, title: 'Address', text: 'Where it is — building, street and town.',
  })
  await callout(page, 'label[for="warehouse_is_primary"]', {
    step: 29, title: 'Primary warehouse', text: 'Your main location. Setting it here clears the flag on any other depot.',
  })
  await callout(page, 'label[for="warehouse_is_active"]', {
    step: 30, title: 'Active', text: 'Inactive depots stay on record but are flagged as not in use and drop off the stock pickers.',
  })
  await callout(page, '[role="dialog"] button:has-text("Cancel")', {
    step: 31, title: 'Cancel', text: 'Discards the form — we tap this to leave the demo depots untouched.',
  })
  await clearHighlight(page)
  await page.locator('[role="dialog"]').getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 3 OF 8 — INVENTORY (per warehouse)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 32, title: 'Open Inventory', text: 'Tap Inventory to see stock per warehouse.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/inventory').click()
  await expect(page).toHaveURL(/\/wholesaler\/inventory/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 3 OF 8',
    title: 'Inventory, per warehouse',
    sub: 'Pick a depot (or the total roll-up), then read levels, batches and every movement.',
  }, { hold: 2400 })

  await callout(page, 'select:has(option:has-text("All warehouses"))', {
    step: 33, title: 'Warehouse selector', text: 'Scope everything below to one depot, or "All warehouses (total)" for the entity-wide roll-up.',
  })
  await callout(page, 'button:has-text("Stock levels")', {
    step: 34, title: 'Stock levels', text: 'On-hand quantity per product for the chosen depot — with low and out-of-stock flags.',
  })
  await callout(page, 'button:has-text("Batches")', {
    step: 35, title: 'Batches', text: 'The lots you hold, with unit cost and expiry, so you can rotate stock first-expiry-first.',
  })
  await callout(page, 'button:has-text("Movements")', {
    step: 36, title: 'Movements', text: 'A signed audit log — every receive, sale, transfer, loss and adjustment, timestamped.',
  })
  await callout(page, 'input[placeholder="Search products..."]', {
    step: 37, title: 'Search', text: 'Jump to any product by name or SKU.',
  })

  const receiveBtn = page.locator('button[title="Receive"]').first()
  if (await has(receiveBtn)) {
    await callout(page, 'button[title="Receive"]', {
      step: 38, title: 'Receive', text: 'Book stock in — quantity, cost, MRP, sell price, batch and expiry — into the chosen depot.',
    })
    await callout(page, 'button[title="Adjust"]', {
      step: 39, title: 'Adjust', text: 'Correct a count: add found stock, log a loss or damage, or set to the counted quantity.',
    })
    await callout(page, 'button[title="Transfer"]', {
      step: 40, title: 'Transfer', text: 'Move stock from one of your depots to another — the two levels stay in lockstep.',
    })

    // ── FLOW: open Receive, explain the fields, then close ──
    await caption(page, { step: 41, title: 'Open Receive', text: 'Tap Receive on a product to see how stock is booked in.' })
    await clearHighlight(page)
    await receiveBtn.click(); await beat(page, 1000)

    const recModal = page.locator('div.fixed.inset-0.z-50')
    await callout(page, 'div.fixed.inset-0.z-50 select', {
      step: 42, title: 'Into which depot', text: 'The warehouse this stock lands in — the movement and the level are stamped to it.',
    })
    await callout(page, 'input[placeholder="Qty"]', {
      step: 43, title: 'Quantity', text: 'How many units you are booking in.',
    })
    await callout(page, 'input[placeholder="Cost"]', {
      step: 44, title: 'Unit cost', text: 'What you paid per unit — feeds margin and your input GST.',
    })
    await callout(page, 'input[placeholder="MRP"]', {
      step: 45, title: 'MRP', text: 'The regulated maximum retail price for the batch.',
    })
    await callout(page, 'input[placeholder="Sell"]', {
      step: 46, title: 'Sell price', text: 'Your selling rate for this batch.',
    })
    await callout(page, 'input[placeholder="auto"]', {
      step: 47, title: 'Batch no.', text: 'Optional — leave blank to auto-number, or type your own lot code.',
    })
    await clearHighlight(page)
    await recModal.locator('button').first().click(); await beat(page, 1000) // the X closes without saving
  } else {
    await callout(page, 'text=Stock levels', {
      step: 38, title: 'Levels, receive & correct', text: 'Once you have depots and products, each row gets Receive, Adjust and Transfer actions here.',
    })
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 4 OF 8 — SELL (the B2B core)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 48, title: 'Open Sell', text: 'Tap Sell to raise a B2B order for a retailer.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/sell').click()
  await expect(page).toHaveURL(/\/wholesaler\/sell/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Sell to a Buyer' })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 4 OF 8',
    title: 'Sell to a retailer',
    sub: 'Pick a linked buyer, build their cart from your catalog, price each line, then place the order.',
  }, { hold: 2600 })

  await callout(page, 'h2:has-text("Sell to a Buyer")', {
    step: 49, title: 'Sell to a Buyer', text: 'Step one is choosing which retailer this order is for.',
  })

  const firstBuyer = page.locator('button.w-full.text-left').first()
  if (await has(firstBuyer)) {
    await callout(page, 'button.w-full.text-left', {
      step: 50, title: 'A buyer card', text: 'Each linked retailer, with its WhatsApp number and any khata it owes you — tap to start their order.',
    })

    // ── FLOW: pick the buyer → catalog + cart ──
    await caption(page, { step: 51, title: 'Pick the buyer', text: 'Tap a retailer to open your catalog for them.' })
    await clearHighlight(page)
    await firstBuyer.click(); await beat(page, 1400)

    await callout(page, 'input[placeholder="Search your products..."]', {
      step: 52, title: 'Search your catalog', text: 'Find the products to add — only your own sellable, in-stock items appear.',
    })

    // Only an in-stock, priced product is clickable — out-of-stock / no-price cards render disabled.
    const firstProduct = page.locator('button:has-text("in stock"):not([disabled])').first()
    if (await has(firstProduct)) {
      await callout(page, 'button:has-text("in stock"):not([disabled])', {
        step: 53, title: 'A product', text: 'Its price at this buyer’s default tier, the unit and live stock. Tap to drop it in the cart.',
      })
      await caption(page, { step: 54, title: 'Add to the cart', text: 'Tap a product — it appears in the Sale panel on the right.' })
      await clearHighlight(page)
      await firstProduct.click(); await beat(page, 1200)

      await callout(page, 'div.p-2.rounded-lg.bg-card', {
        step: 55, title: 'A cart line', text: 'Name, unit price × quantity, the line total, the − / + steppers and a bin to remove it.',
      })

      const tierSelect = page.locator('select:has(option:has-text("Retail rate"))').first()
      if (await has(tierSelect)) {
        await callout(page, 'select:has(option:has-text("Retail rate"))', {
          step: 56, title: 'Per-line rate tier', text: 'Override each line to Retail, Wholesale or Distributor rate — the server re-prices authoritatively.',
        })
        await clearHighlight(page)
        await tierSelect.selectOption('WHOLESALE').catch(() => {}); await beat(page, 900)
      }

      await callout(page, 'text=Grand Total', {
        step: 57, title: 'Totals', text: 'Subtotal, GST at a flat 5% and the grand total — always live as you edit the cart.',
      })

      const whFilter = page.locator('select:has(option:has-text("Sell from"))').first()
      if (await has(whFilter)) {
        await callout(page, 'select:has(option:has-text("Sell from"))', {
          step: 58, title: 'Sell from', text: 'Optional — draw this order from one depot, or from any stock (the entity total).',
        })
      }

      await callout(page, 'button:has-text("Sell now")', {
        step: 59, title: 'Document type', text: 'Sell now invoices immediately; Sales order commits to fulfil later; Quotation is a non-binding quote.',
      })
      await callout(page, 'button:has-text("Khata / Credit")', {
        step: 60, title: 'Payment', text: 'Khata / Credit debits the buyer’s account with you; Cash records paid-now.',
      })
      await callout(page, 'button:has-text("Confirm Sale")', {
        step: 61, title: 'Place the order', text: 'Confirm deducts your stock, receives the goods into the buyer, and (on credit) debits their khata.',
      }, 3000)
    } else {
      await caption(page, {
        step: 53, title: 'Then build the cart',
        text: 'With products in your catalog, you’d add them here, set a rate tier per line, and confirm the sale.',
      }, 2600)
    }
  } else {
    await callout(page, 'text=No connected buyers', {
      step: 50, title: 'Connect a buyer first', text: 'Buyers appear once you connect a retailer from the network browser — then you build their cart here.',
    }, 2800)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 5 OF 8 — QUOTES & ORDERS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 62, title: 'Open Quotes & Orders', text: 'Tap Quotes & Orders to fulfil the drafts you raised.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/quotes').click()
  await expect(page).toHaveURL(/\/wholesaler\/quotes/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Quotes & Orders' })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 5 OF 8',
    title: 'Quotes & Orders',
    sub: 'The sales orders and quotations you created — fulfil a draft into an invoice, in full or part.',
  }, { hold: 2400 })

  await callout(page, 'h2:has-text("Quotes")', {
    step: 63, title: 'Quotes & Orders', text: 'Every sales order and quotation you raised, newest first.',
  })

  const firstSO = page.locator('div.divide-y > div > button').first()
  if (await has(firstSO)) {
    await callout(page, 'div.divide-y > div > button', {
      step: 64, title: 'An order row', text: 'Buyer, an Order/Quote tag and a status badge (Draft, Confirmed, Partially fulfilled), plus the total.',
    })
    await caption(page, { step: 65, title: 'Expand it', text: 'Tap a row to see its lines and the fulfil controls.' })
    await clearHighlight(page)
    await firstSO.click(); await beat(page, 1400)

    const fulfilAll = page.locator('button:has-text("Fulfil all remaining")').first()
    if (await has(fulfilAll)) {
      await callout(page, 'button:has-text("Fulfil all remaining")', {
        step: 66, title: 'Fulfil into an invoice', text: 'Turn a draft into a Sales Invoice — that deducts your stock and, on credit, debits the buyer’s khata.',
      }, 3000)
    } else {
      await callout(page, 'div.divide-y > div > button', {
        step: 66, title: 'Line items', text: 'A confirmed order shows its lines and totals; a still-open one adds per-line fulfil quantities.',
      })
    }
  } else {
    await callout(page, 'text=No quotes or sales orders', {
      step: 64, title: 'Nothing to fulfil yet', text: 'Sales orders and quotations you save on the Sell page land here, ready to invoice.',
    }, 2800)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 6 OF 8 — CREDIT / KHATA
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 67, title: 'Open Credit', text: 'Tap Credit to manage the khata you extend to retailers.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/khata').click()
  await expect(page).toHaveURL(/\/wholesaler\/khata/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: /Credit/i })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 6 OF 8',
    title: 'Credit (Khata)',
    sub: 'You are the creditor here — every retailer account, its limit, balance and ledger.',
  }, { hold: 2400 })

  await callout(page, 'h2:has-text("Credit")', {
    step: 68, title: 'Credit (Khata)', text: 'The traditional shop khata — the header sums how much is outstanding across all accounts.',
  })

  const firstKhata = page.locator('div.divide-y > div > button').first()
  if (await has(firstKhata)) {
    await callout(page, 'div.divide-y > div > button', {
      step: 69, title: 'An account', text: 'Buyer name, status, the credit limit and available room, and the amount owed on the right.',
    })
    await caption(page, { step: 70, title: 'Expand it', text: 'Tap a row to open its actions and ledger.' })
    await clearHighlight(page)
    await firstKhata.click(); await beat(page, 1400)

    if (await has(page.locator('button:has-text("Record payment")'))) {
      await callout(page, 'button:has-text("Record payment")', {
        step: 71, title: 'Record payment', text: 'Log a repayment against the balance — cash, mBoB, mPay, RTGS or bank transfer, with a reference.',
      })
      await callout(page, 'button:has-text("Set limit")', {
        step: 72, title: 'Set limit', text: 'Set the credit ceiling and the payment term in days for this retailer.',
      })
      await callout(page, 'button:has-text("Freeze"), button:has-text("Unfreeze")', {
        step: 73, title: 'Freeze / Unfreeze', text: 'Freeze an account to block further credit sales until they pay down.',
      })
      await callout(page, 'button:has-text("Write-off")', {
        step: 74, title: 'Write-off', text: 'Owner-only — write down (or charge) a balance with a reason. Managers do not see this.',
      }, 3000)
      await callout(page, 'div.max-h-64', {
        step: 75, title: 'The ledger', text: 'Every debit and credit with the running balance — the full history for this account.',
      })
    }
  } else {
    await callout(page, 'text=No credit accounts', {
      step: 69, title: 'No khata yet', text: 'Accounts appear once you connect a buyer or make a credit sale — then you manage limits and payments here.',
    }, 2800)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 7 OF 8 — GST REPORT (NEW)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 76, title: 'Open the GST Report', text: 'Tap GST Report — your tax filing, computed for you.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/reports').click()
  await expect(page).toHaveURL(/\/wholesaler\/reports/, { timeout: 15000 })
  await expect(page.getByText('Net GST payable')).toBeVisible({ timeout: 20000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 7 OF 8',
    title: 'GST Report',
    sub: 'Output tax, input credit and net GST payable, with a taxable-vs-exempt split. NEW.',
  }, { hold: 2800 })

  await callout(page, 'h2:has-text("GST Report")', {
    step: 77, title: 'GST Report', text: 'Everything the Ministry of Finance filing needs, entity-scoped to your business.',
  })
  await callout(page, 'input[type="date"] >> nth=0', {
    step: 78, title: 'Date range', text: 'Pick the period — one month for a filing, a year for the full picture.',
  })
  await callout(page, 'text=Gross sales', {
    step: 79, title: 'Gross sales', text: 'Total turnover in the period, and how many sales it came from.',
  })
  await callout(page, 'text=Taxable sales', {
    step: 80, title: 'Taxable vs exempt', text: 'Turnover split into taxable sales and — thanks to the exempt flag — GST-free sales.',
  })
  await callout(page, 'text=Exempt sales', {
    step: 81, title: 'Exempt sales', text: 'Turnover that carries no GST — shown here but excluded from output tax.',
  })
  await callout(page, 'text=Output GST', {
    step: 82, title: 'Output GST', text: 'The 5% GST you collected on sales — your liability.',
  })
  await callout(page, 'text=Input GST (ITC)', {
    step: 83, title: 'Input GST (ITC)', text: 'GST you paid on B2B purchases — credit that offsets what you owe.',
  })
  await callout(page, 'text=Net GST payable', {
    step: 84, title: 'Net GST payable', text: 'Output minus input — the single figure you remit. Owner-critical.',
  }, 3000)
  await callout(page, 'text=Month', {
    step: 85, title: 'Monthly breakdown', text: 'The same figures month by month, so filing is copy-and-go.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 8 OF 8 — SETTINGS (+ owner-only NQRC Payment QR, NEW)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 86, title: 'Open Settings', text: 'Tap Settings to edit your business profile and payment QR.' })
  await clearHighlight(page)
  await navLink(page, '/wholesaler/settings').click()
  await expect(page).toHaveURL(/\/wholesaler\/settings/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Business Settings' })).toBeVisible({ timeout: 15000 }); await beat(page, 1200)

  await titleCard(page, {
    kicker: 'SCREEN 8 OF 8',
    title: 'Business Settings',
    sub: 'Your profile, marketplace details and — owner-only — your Bhutan NQRC payment QR. NEW.',
  }, { hold: 2600 })

  await callout(page, 'h1:has-text("Business Settings")', {
    step: 87, title: 'Business Settings', text: 'The details that identify your business across the platform.',
  })
  await callout(page, 'text=Business Name', {
    step: 88, title: 'Business Name', text: 'Your legal name, shown on invoices and the console header.',
  })
  await callout(page, 'text=WhatsApp Number', {
    step: 89, title: 'WhatsApp Number', text: 'The E.164 number used for order alerts and receipts.',
  })
  await callout(page, 'text=TPN / GSTIN', {
    step: 90, title: 'TPN / GSTIN', text: 'Your Bhutan taxpayer number — it signs invoices for GST compliance.',
  })
  await callout(page, 'text=Shop Slug', {
    step: 91, title: 'Shop Slug', text: 'Optional — set a handle to publish a public storefront at /shop/your-slug.',
  })
  await callout(page, 'text=Fulfilment', {
    step: 92, title: 'Fulfilment', text: 'Delivery (a rider is dispatched), Pickup-only, or Catalog-only for any public listing.',
  })

  // ── The owner-only NQRC Payment QR editor (NEW) ──
  await callout(page, 'text=Payment QR (Bhutan NQRC)', {
    step: 93, title: 'Payment QR · NEW', text: 'A Bhutan NQRC merchant profile. These are your bank details, so only the OWNER sub-role sees this block.',
  })
  await callout(page, 'text=Show a payment QR for online payments', {
    step: 94, title: 'Turn it on', text: 'The master switch — tick it to show a scannable payment QR at checkout. Let us reveal the fields.',
  })
  await clearHighlight(page)
  await page.getByText('Show a payment QR for online payments').click(); await beat(page, 900)

  await callout(page, 'text=Merchant name on QR', {
    step: 95, title: 'Merchant name', text: 'The name shown on the customer’s banking app — defaults to your business name.',
  })
  await callout(page, 'input[placeholder="Thimphu"]', {
    step: 96, title: 'City', text: 'The town you are registered in — an NQRC data field.',
  })
  await callout(page, 'input[placeholder="Registered with your bank"]', {
    step: 97, title: 'Merchant / account ID', text: 'Your merchant or account number, from your bank’s onboarding.',
  })
  await callout(page, 'input[placeholder="From your bank / RMA"]', {
    step: 98, title: 'PSP / scheme GUID', text: 'Identifies the NQRC scheme on the Bhutan Financial Switch — issued by your bank or the RMA.',
  })
  await callout(page, 'input[placeholder="e.g. 5411"]', {
    step: 99, title: 'MCC', text: 'Merchant category code — classifies the business (e.g. 5411 for grocery).',
  })
  await callout(page, 'input[placeholder="26"]', {
    step: 100, title: 'Account template tag', text: 'The EMVCo tag (26–51). Leave it at 26 unless your bank says otherwise.',
  })
  await callout(page, 'button:has-text("Save Changes")', {
    step: 101, title: 'Save Changes', text: 'Save once and the QR appears automatically at online checkout — amount, BTN currency and checksum are added for you.',
  }, 3000)

  // ═════════════════════════════════════════════════════════════════════════
  // WRAP UP
  // ═════════════════════════════════════════════════════════════════════════
  await clearHighlight(page)
  await titleCard(page, {
    kicker: 'WHOLESALER · B2B CONSOLE',
    title: 'That’s the whole console',
    sub: 'Depots and inventory, selling to retailers, quotes, khata, the GST report and your payment QR — all in one place.',
  }, { hold: 3200 })
  await caption(page, {
    step: 102, title: 'You’re ready to supply your network',
    text: 'That’s every screen — welcome to the middle tier.',
  }, 3200)

  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
