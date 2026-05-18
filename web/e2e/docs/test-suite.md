# E2E Test Suite — Reference Guide

## Structure

```
web/e2e/
├── docs/               # This documentation
├── fixtures/
│   ├── db-seed.js      # Seeds test data (products, orders, khata, users, batches)
│   ├── db-cleanup.js   # Cleans up test artifacts
│   └── test-data.js    # TEST_PRODUCTS, TEST_ORDERS, TEST_KHATA_ACCOUNTS, TEST_USERS, etc.
├── page-objects/
│   ├── pos-page.js         # POS touch page (/pos/touch)
│   ├── cart-panel.js       # Cart panel with items, totals, payment methods
│   ├── customer-id-modal.js    # Customer WhatsApp identification modal
│   ├── stock-gate-modal.js     # Stock availability gate modal
│   ├── restock-modal.js        # Emergency restock modal
│   ├── orders-list-page.js     # Orders list page (/pos/orders)
│   └── order-detail-page.js    # Order detail page (/pos/orders/[id])
├── setup/
│   ├── global-setup.js    # Runs db-seed + clears stale carts
│   └── auth-setup.js      # Signs in each role, saves storage state
├── specs/                 # Test spec files (see below)
└── storage/               # Playwright auth storage state (gitignored)
```

## Playwright Projects

Tests run across multiple auth projects (defined in `web/playwright.config.js`):

| Project | Auth | Used For |
|---------|------|----------|
| `auth-setup` | None | Signs in users, saves storage state to `e2e/storage/*.json` |
| `retailer` | retailer-auth.json | Default project for v1-v8 and c1-c5 specs |
| `manager` | manager-auth.json | v2+ specs with cancel/refund permissions |
| `owner` | owner-auth.json | v2+ specs with full permissions |
| `unauthenticated` | None | v1-auth, c3-whatsapp-otp |
| `cashier` | cashier-auth.json | v9-cashier-access (via inline `test.use`) |

## Test Data

All test data is defined in `e2e/fixtures/test-data.js` and seeded by `e2e/fixtures/db-seed.js`:

- **Entity**: Dawai Tshongkhang (`a0000000-0000-4000-8000-000000000004`) — the retailer
- **Products**: 10 products (TEST_PRODUCTS[0-9]) — varying stock levels
- **Orders**: 6 seeded orders (TEST_ORDERS[0-5]) — COMPLETED, CONFIRMED, DELIVERED, CANCELLED, REFUND_REQUESTED, DRAFT
- **Khata Accounts**: 3 consumer accounts + 1 B2B account (TEST_KHATA_ACCOUNTS)
- **Batches**: 8 product batches (TEST_BATCHES) with opening stock
- **Users**: cashier, manager, retailer/owner (password: `test1234`)

## Spec Files — Maintained Tests

### v2a: Product Selection (`specs/v2a-product-selection.spec.js`)
Page: `/pos/touch` — product grid and search
- Product grid loads with items
- Search filters by name and SKU
- Search clears and restores full grid
- Out-of-stock products hidden from grid
- Click product card adds to cart
- Add multiple products to cart
- Clicking same product increments quantity

### v2b: Cart Management (`specs/v2b-cart-management.spec.js`)
Page: `/pos/touch` — cart panel
- Increment/decrement quantity with +/- buttons
- Decrement to zero removes item
- Remove item with trash button
- Correct GST breakdown per item
- Correct totals (subtotal, GST 5%, grand total)
- Checkout disabled without payment method
- Checkout disabled when cart empty

### v2c: Customer Identification (`specs/v2c-customer-id.spec.js`)
Page: `/pos/touch` — customer ID modal
- Modal prompted before checkout
- Accept valid WhatsApp phone
- Show error for invalid phone
- Warning when no customer ID present
- Cancel returns to cart

### v2d: Payment Methods (`specs/v2d-payment-methods.spec.js`)
Page: `/pos/touch` — payment method selection
- 3 payment methods shown: Online, Cash, Credit
- CASH checkout succeeds
- ONLINE requires journal number
- ONLINE proceeds with journal number
- CREDIT with valid khata proceeds
- CREDIT opens customer identification
- Journal number clears on method switch

### v2e: Checkout (`specs/v2e-checkout.spec.js`)
Page: `/pos/touch` — checkout flow
- Stock gate modal appears when stock exceeded
- Order created with correct invoice format
- Cart cleared after checkout
- Redirects to order detail page
- Receipt sent via WhatsApp gateway (fire-and-forget)

### v2f: GST Calculation (`specs/v2f-gst-calc.spec.js`)
Page: `/pos/touch` — GST math
- 5% GST on single item
- 5% GST on multiple items with different prices
- 5% GST on item with quantity > 1

### v2g: Manager Discount (`specs/v2g-manager-discount.spec.js`)
Page: `/pos/touch` — discount/override
- Flat discount applies and recalculates GST
- Percentage discount applies correctly
- Discount badge shows on cart item
- Price override changes unit price and recalculates

### v2h: Error Handling (`specs/v2h-error-handling.spec.js`)
Page: `/pos/touch` — error states
- DB insert failure shows error banner (mocks `/api/pos/orders` to return 500)
- Credit sale without khata account shows error for CASHIER
- Note: Credit test currently bypasses OTP flow — see `credit-otp-flow.md`

### v3: Order Management (`specs/v3-order-management.spec.js`)
Pages: `/pos/orders`, `/pos/orders/[id]`
Auth: manager-auth.json (can cancel/refund)

**Orders List:**
- Displays heading, search, seeded orders
- Status badges per order
- WhatsApp badge on WhatsApp-sourced orders
- Search by order number and partial order number
- Filter by COMPLETED, CANCELLED
- Empty state for no matches
- Click order navigates to detail

**Order Detail:**
- Shows grand total, GST, order items, payment method
- WhatsApp source badge on WhatsApp orders
- Unmatched items warning for WhatsApp orders
- Back button returns to orders list

**Cancel Order:**
- Cancellable statuses show Cancel Order button
- Non-cancellable statuses hide it
- Stock restored notice in cancel modal

**Refund:**
- Refundable statuses show Request Refund button
- Non-refundable statuses hide it
- Partial refund — select one item and submit
- Full refund — select all items
- Manager can approve pending refund

### v4: Inventory (`specs/v4-inventory.spec.js`)
Page: `/pos/inventory`
Auth: manager-auth.json
- Inventory page with heading, products from seed data
- Product details: name, stock, price
- Search by name and SKU
- Filter: ALL, LOW, OUT
- Alert banners with correct counts
- Out-of-stock/low-stock styling
- Stock adjustment: RESTOCK, LOSS, DAMAGED
- Movement history
- Predictions tab with summary cards

### v6: Khata Credit (`specs/v6-khata-credit.spec.js`)
Page: `/pos/khata`
Auth: retailer, manager, owner (varies by describe block)
- Account list with seeded data, name/phone/outstanding/limit/status
- Search by name and phone
- Create account with phone, name, credit limit, term days
- Validate phone format, reject duplicates
- Account detail: outstanding, credit limit, available, transaction ledger
- Record payment: cash and mBoB, validates amount
- Role restrictions: CASHIER can't see Record Payment
- Adjust balance: WRITE_OFF, CORRECTION (OWNER only)
- Set credit limit (OWNER only)
- Freeze/unfreeze account, frozen blocks CREDIT checkout

### v7: Stock Alerts (`specs/v7-stock-alerts.spec.js`)
Page: `/pos/inventory`
Auth: manager-auth.json
- Low stock detection (below reorder_point)
- Zero stock detection
- Banner counts match
- View button filters to OUT/LOW
- WhatsApp alert sent via gateway
- Alert contains correct product info

### v9: Cashier Access (`specs/v9-cashier-access.spec.js`)
Auth: cashier-auth.json
- Can access POS home and orders (POS section)
- Redirected from: Purchases, New purchase, Products, Inventory, Khata, Cash registers
- No restricted nav buttons in keyboard POS

### v10: Keyboard Cart Edit (`specs/v10-keyboard-cart-edit.spec.js`)
Page: `/pos/touch`
Auth: manager-auth.json
- Enter confirms quantity edit
- Tab confirms edit and stays
- Escape cancels edit and reverts

## Known Gaps

- **CREDIT OTP flow**: Bypassed in v2h tests — see `credit-otp-flow.md` for implementation plan
- **v3 WHATSAPP filter**: `test.fixme` — POS_FILTERS doesn't include WHATSAPP
- **v3 Cancel with reason**: `test.fixme` — needs cancel API implementation
- **v3 Status timeline**: Skipped — `order_status_log` not seeded
- **v3 Partial/full refund**: Skipped for manager/owner projects when prior project mutated order data
- **v2e Payment scanner**: All `test.fixme` — payment scanner not implemented

## Running Tests

```bash
# From web/ directory
cd web

# All tests
npx playwright test

# Specific spec
npx playwright test e2e/specs/v2h-error-handling.spec.js

# With list reporter
npx playwright test --reporter=list

# Single test by title
npx playwright test -g "back button"
```
