# Gap Analysis: Web POS (Cloud) vs Desktop App (Electron + PocketBase)

**Date**: 2026-05-07
**Scope**: Feature comparison between the Supabase-backed web POS and the PocketBase-backed Electron desktop terminal, with priorities for closing gaps before in-store deployment.

---

## System Overview

| | Web App (Cloud) | Desktop App (Electron) |
|---|---|---|
| **Database** | Supabase (Postgres) | PocketBase (SQLite) |
| **Connectivity** | Requires internet | Full offline capability |
| **Stack** | Next.js, React hooks, JS/JSX | Next.js, React hooks, TS/TSX, Zustand |
| **Deployment** | Browser (any device) | Electron AppImage/deb on Linux |
| **Auth** | Supabase Auth + JWT roles (OWNER/MANAGER/CASHIER) | PocketBase admin-only login |
| **Target user** | All roles, all locations | In-store POS terminal |
| **Pages** | 20+ routes | 7 routes |

---

## Feature Comparison Matrix

### POS Operations

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Keyboard POS mode (F-key shortcuts, table layout, inline qty edit) | Yes — `app/pos/page.jsx` | Partial — `use-pos-shortcuts.ts` has shortcuts but single-mode layout | Yellow |
| Touch POS mode (product grid, slide-out cart) | Yes — `app/pos/touch/page.jsx` | Single touch-like mode — `desktop/app/page.tsx` | Green |
| Multi-cart (hold, switch, cancel) | Yes — F4 hold, F6 cancel, Tab switch | Yes — `held-carts-modal.tsx`, `use-held-carts.ts` | Green |
| Line-item discount (flat + percentage) | Yes — Ctrl+M, `discount-modal.jsx`, audit trail | Basic discount in cart-item-row | Red |
| Payment methods | ONLINE (journal #), CASH, CREDIT | Cash, mBoB, mPay, RTGS, Credit | Red |
| Credit OTP verification | Yes — `CustomerOtpModal` | No OTP flow | Red |
| Barcode scanning | Via search modal | Dedicated `barcode-scanner.tsx` | Green |
| Receipt printing | Basic receipt component | Thermal printer via `electron/printer.js` + escpos | N/A (desktop advantage) |
| Undo cart operations | No | Yes — `use-undo.ts` | N/A (desktop advantage) |
| Theme toggle (light/dark) | Dark only | Yes — `theme-provider.tsx` | N/A (desktop advantage) |
| Numpad component | No | Yes — `numpad.tsx` | N/A (desktop advantage) |

### Shift Management

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Open/close shift | Yes — `use-shift.js`, start/end modals | Yes — `shift-modal.tsx`, `use-shifts.ts` | Green |
| Shift transaction tracking | Yes — `/api/shifts/track-transaction` | Yes — via PocketBase | Green |
| Z-report (end-of-day breakdown) | No | Yes — `z-report-modal.tsx` | N/A (desktop advantage) |
| Cash adjustments ledger | No (uses shift system) | Yes — `adjustments/page.tsx`, `use-cash-adjustments.ts` | N/A (desktop advantage) |
| Cash registers | Yes — `/pos/registers`, `/api/cash-registers` | No | Yellow |

### Products & Inventory

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Product CRUD (add, edit, delete) | Yes — `/pos/products`, `product-form.jsx` | No — browse/search only | Red |
| Product packages (bundles) | Yes — `package-form.jsx` | No | Red |
| Product specifications | Yes — `entity-product-specifications.jsx` | No | Red |
| HSN code management | Yes — `hsn-code-selector.jsx` | No | Red |
| Category management | Yes — `/admin/categories` | Seed data only | Red |
| Batch management | Yes — batch-aware pricing, expiry tracking | Basic inventory | Red |
| Stock adjustments | Yes — `adjust-stock-modal.jsx` | Yes — `inventory/page.tsx` | Green |
| Stock movement history | Yes — `movement-history.jsx` | No | Yellow |
| Receive stock | Yes — `receive-stock-modal.jsx` | No | Red |
| Stock predictions | Yes — `prediction-tab.jsx`, `/api/predictions` | No | Yellow |
| Bill parsing (AI) | Yes — `scan-bill-modal.jsx`, `/api/bill-parse` | No | Yellow |

### Purchasing & Supply Chain

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Draft purchase orders | Yes — `use-draft-purchases.js`, draft UI | No | Red |
| Purchase order creation | Yes — `/pos/purchases/new` | No | Red |
| Purchase order confirmation | Yes — `/api/purchases/[id]/confirm` | No | Red |
| Wholesaler connections | Yes — `restock/wholesaler-list.jsx` | No | Red |
| Wholesaler catalog browsing | Yes — `restock/wholesaler-catalog.jsx` | No | Red |
| Restock cart | Yes — `restock/restock-cart.jsx` | No | Red |
| Wholesale orders | Yes — `use-wholesale-orders.js` | No | Red |

### Orders & Invoicing

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Order list | Yes — `/pos/orders` | Yes — `orders/page.tsx` | Green |
| Order detail page | Yes — `/pos/orders/[id]` with timeline | Dialog expand only | Yellow |
| Cancel order | Yes — `cancel-modal.jsx` | Yes — in order dialog | Green |
| Refund (partial/line-item) | Yes — `refund-modal.jsx` with item selection | Yes — partial refund selection | Green |
| Sales invoice generation | Yes — `/api/sales/[id]/invoice` | Receipt modal only | Yellow |
| Digital signature (SHA-256) | Yes — in `processPayment` | No | Yellow |
| GST audit trail | Yes — `audit_logs` table, discount audit trigger | No | Red |

### Customer & Khata (Credit)

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Customer list | No dedicated page (OTP-based) | Yes — `customers/page.tsx` | N/A |
| Khata account management | Yes — `/pos/khata`, `use-khata.js` | Basic — `use-customers.ts` | Yellow |
| Record repayment | Yes — `record-payment-modal.jsx` | Yes — in customer dialog | Green |
| Adjust balance | Yes — `adjust-balance-modal.jsx` | No | Yellow |
| Create khata account | Yes — `create-account-modal.jsx` | Auto-create on credit sale | Green |
| Credit limit enforcement | Yes — DB constraint + trigger | Basic | Yellow |

### Marketplace & Delivery (Cloud-Only)

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Consumer storefront | Yes — `/shop/store_[id]` | N/A | Out of scope |
| Marketplace checkout | Yes — `/shop/checkout` | N/A | Out of scope |
| Consumer order tracking | Yes — `/shop/orders` | N/A | Out of scope |
| Rider app | Yes — `/rider` (login, orders, history, profile) | N/A | Out of scope |
| Rider order management | Yes — accept/reject/pickup/deliver APIs | N/A | Out of scope |
| Delivery fee | Yes — `/api/rider/orders/[id]/fee` | N/A | Out of scope |

### Administration

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Team management (users) | Yes — `/admin/team` | Single admin only | Red |
| Role-based access (OWNER/MANAGER/CASHIER) | Yes — page-level redirects, nav restrictions | No roles | Red |
| Multi-store management | Yes — `/admin/stores` for owners | Single store (PocketBase) | Yellow |
| Rider management | Yes — `/admin/riders` | N/A | Out of scope |
| Units management | Yes — `/admin/units` | No | Yellow |
| Store settings | Basic | Rich — printer, sync, receipt customization | N/A (desktop advantage) |

### Infrastructure

| Feature | Web (Cloud) | Desktop (Electron) | Gap |
|---------|:-----------:|:------------------:|:---:|
| Cloud sync | N/A (cloud-native) | UI exists, logic incomplete | Red |
| Offline operation | No | Yes (PocketBase local) | N/A (desktop advantage) |
| Thermal printer integration | No | Yes — escpos via Electron IPC | N/A (desktop advantage) |
| Electron packaging | N/A | Yes — electron-builder (AppImage/deb) | N/A |
| Docker deployment | No (cloud) | Yes — Dockerfile, docker-compose | N/A |
| E2E tests | 10+ specs | 0 tests | Red |
| API routes | ~50 routes | 0 (PocketBase direct) | N/A (different architecture) |

---

## Priority Gap List

### P0 — Must Have Before Store Deployment

These gaps prevent the desktop app from being usable in a real store:

| # | Gap | Why it's P0 | Web reference |
|---|-----|------------|---------------|
| 1 | **Product CRUD** | Store managers must add/edit products, set prices, manage batches. Currently can only browse and sell. | `app/pos/products/page.jsx`, `components/pos/products/product-form.jsx` |
| 2 | **Role-based access** | CASHIER shouldn't access inventory/settings. MANAGER needs limited admin. Currently single-admin PocketBase login. | `lib/auth.js` `getRoleClaims()`, page-level redirects in `app/pos/purchases/page.jsx` etc. |
| 3 | **Cloud sync implementation** | Settings page has sync config UI (remote URL, API key, interval) but no actual sync logic. Offline sales must reach Supabase. | All web data flows through Supabase client |

### P1 — Should Have for Operational Completeness

| # | Gap | Why it's P1 | Web reference |
|---|-----|------------|---------------|
| 4 | **Purchase/restock workflow** | Stores need to order from wholesalers. Impossible from desktop today. | `app/pos/purchases/`, `hooks/use-draft-purchases.js`, `components/pos/restock/` |
| 5 | **Payment method alignment** | Desktop uses 5 methods (mBoB, mPay, RTGS, Cash, Credit). Web uses 3 (ONLINE, Cash, Credit) with journal number. Should match. | `components/pos/keyboard/payment-modal.jsx` |
| 6 | **Percentage discount + audit** | Desktop only has flat discount. Web supports flat/percentage with discount_type column and audit_logs trigger. | `components/pos/keyboard/discount-modal.jsx`, `supabase/migrations/070_discount_audit.sql` |
| 7 | **Khata ledger improvements** | Desktop has basic customer credit. Web has full ledger with repayments, balance adjustments, frozen accounts. | `app/pos/khata/`, `hooks/use-khata.js` |
| 8 | **Order detail + invoice** | Desktop shows orders in a dialog. Web has full detail page with timeline. Desktop needs formal invoice for GST compliance. | `app/pos/orders/[id]/page.jsx`, `app/api/sales/[id]/invoice/route.js` |
| 9 | **GST audit trail** | Desktop has no audit logging. Web has `audit_logs` table with triggers for discount changes. | `supabase/migrations/009_audit_logs.sql`, `070_discount_audit.sql` |
| 10 | **Stock receive workflow** | Desktop can adjust stock but can't receive from purchase orders or scan supplier bills. | `components/pos/inventory/receive-stock-modal.jsx`, `scan-bill-modal.jsx` |

### P2 — Nice to Have

| # | Gap | Notes |
|---|-----|-------|
| 11 | Keyboard POS mode (dual mode) | Web has both keyboard and touch modes. Desktop only has touch-like. |
| 12 | E2E tests | Desktop has 0 tests. Should have smoke tests for core flows. |
| 13 | Stock movement history | Web has full movement log. Desktop has basic stock adjustments. |
| 14 | Stock predictions | Web has ML predictions. Desktop has none. |

---

## Desktop-Only Advantages (Preserve These)

These features exist only in the desktop app and should NOT be removed during alignment:

| Feature | Location | Notes |
|---------|----------|-------|
| Offline-first (PocketBase) | `pb/`, `electron/pb-launcher.js` | Core value proposition — works without internet |
| Thermal printer | `electron/printer.js` | escpos integration for receipt printing |
| Z-report | `components/pos/z-report-modal.tsx` | End-of-day sales breakdown |
| Cash adjustments ledger | `app/adjustments/page.tsx` | Separate from shift system |
| Undo support | `hooks/use-undo.ts` | Cart operation undo |
| Light/dark theme | `providers/theme-provider.tsx` | Theme toggle |
| Barcode scanner component | `components/pos/barcode-scanner.tsx` | Dedicated scanner UI |
| Electron packaging | `package.json` electron-builder | AppImage/deb for Linux |
| Numpad component | `components/ui/numpad.tsx` | Touch-friendly number input |
| Product favorites | `hooks/use-favorites.ts` | Quick-access favorite products |

---

## Recommended Sync Architecture

The desktop app syncs a subset of the web app's data model:

```
PocketBase (local)                    Supabase (cloud)
─────────────────                     ──────────────────
Sync UP (desktop → cloud):
  orders / order_items          →     orders / order_items
  inventory_movements           →     inventory_movements
  shift_transactions            →     shift_transactions
  cash_adjustments              →     cash_adjustments

Sync DOWN (cloud → desktop):
  products / product_batches    ←     products / product_batches
  categories                    ←     categories
  entities / settings           ←     entities / settings
  user_profiles (roles)         ←     user_profiles
  khata_accounts                ←     khata_accounts

Conflict resolution:
  Orders:       last-write-wins with order_no as idempotency key
  Products:     cloud is source of truth — always overwrite local
  Inventory:    cloud aggregates movements from all terminals
  Khata:        cloud calculates outstanding_balance from transactions
```

Sync trigger: configurable interval (default 5 min) + on-connect push.

---

## Hooks Comparison

| Web Hook | Desktop Hook | Parity |
|----------|-------------|--------|
| `use-cart.js` | `use-cart.ts` | Rough parity — both manage cart state |
| `use-shift.js` | `use-shifts.ts` | Desktop richer (Z-report, adjustments) |
| `use-orders.js` | `use-orders.ts` | Desktop has partial refund; web has timeline |
| `use-products.js` | `use-products.ts` | Desktop browse-only; web has CRUD |
| `use-inventory.js` | — | No desktop equivalent |
| `use-purchases.js` | — | No desktop equivalent |
| `use-draft-purchases.js` | — | No desktop equivalent |
| `use-wholesale-orders.js` | — | No desktop equivalent |
| `use-restock.js` | — | No desktop equivalent |
| `use-khata.js` | `use-customers.ts` | Desktop has basic credit; web has full ledger |
| `use-shop-orders.js` | — | Out of scope |
| `use-rider.js` | — | Out of scope |
| `use-owner-stores.js` | — | Out of scope |
| `use-admin-auth.js` | `use-auth.ts` | Desktop single-role; web multi-role |
| `use-stock-predictions.js` | — | No desktop equivalent |
| `use-units.js` | — | No desktop equivalent |
| `use-hsn-codes.js` | — | No desktop equivalent |
| `use-category-properties.js` | — | No desktop equivalent |
| `use-entity-product-specifications.js` | — | No desktop equivalent |
| `use-product-catalog.js` | `use-products.ts` | Partial — desktop has product listing |
| `use-keyboard-registry.js` | `use-keyboard-registry.ts` | Parity |
| — | `use-checkout.ts` | Web has checkout logic inline in page |
| — | `use-cash-adjustments.ts` | No web equivalent (uses shift system) |
| — | `use-favorites.ts` | No web equivalent |
| — | `use-held-carts.ts` | Web has holdCart in use-cart |
| — | `use-layout-preset.ts` | No web equivalent |
| — | `use-platform.ts` | No web equivalent (Electron detection) |
| — | `use-pos-context.tsx` | No web equivalent |
| — | `use-pos-shortcuts.ts` | Web has shortcuts inline in page |
| — | `use-settings.ts` | Web uses entity data from Supabase |
| — | `use-undo.ts` | No web equivalent |

---

## Verification Checklist

- [ ] P0-1: Add a product on desktop → verify it persists in PocketBase → syncs to Supabase
- [ ] P0-2: Login as CASHIER on desktop → verify inventory/settings pages are blocked
- [ ] P0-3: Make 5 sales offline → reconnect → verify all 5 orders appear in web dashboard
- [ ] P1-5: Process ONLINE payment with journal number on desktop → verify payment_ref stored
- [ ] P1-6: Apply 10% percentage discount on desktop → verify discount_type and audit log
- [ ] P1-8: Generate invoice from desktop → verify GST compliance (TPN, digital signature, item breakdown)
