# Feature: Vendor Keyboard/Desktop UI

**Feature ID**: F-KBD-002  
**Phase**: 3  
**Status**: Complete

---

## Overview

Full keyboard-driven POS interface for desktop cashiers. Every action is reachable without a mouse. The keyboard POS is the **default route** (`/pos`); the touch POS is at `/pos/touch` and toggled via F9.

---

## Cart Table Columns

| # | Qty | Product | Batch | Stock | Unit Price | Total |
|---|-----|---------|-------|-------|------------|-------|

- **Batch**: batch number in blue, expiry date beneath if present, `—` for unbatched
- **Stock**: live available qty from `item.batch.available_qty` (joined from `product_batches.quantity`)

---

## Product Search Modal

Queried directly from `product_batches` with an explicit `entity_id` filter — never the global `products` table or `sellable_products` view. This ensures:
- Only the vendor's own stocked products appear
- Each active batch appears as a **separate row** (cashier picks the specific batch)
- Barcode scan is also entity-scoped (batch barcode → product SKU fallback)

**Columns**: `# | Product | SKU | Batch | Stock | Price`

Results are FEFO-ordered (earliest-expiring first). Limit 9 rows, selectable by keys 1–9.

---

## Payment Methods

Three options: **Online**, **Cash**, **Credit** (DB value: `ONLINE`, `CASH`, `CREDIT`).

| Key | Method | Notes |
|-----|--------|-------|
| 1 | Online | Journal number required (entered from customer's payment confirmation) |
| 2 | Cash | Denomination tiles, change calculation |
| 3 | Credit | Requires customer WhatsApp OTP verification |

**Online**: when selected, a mandatory journal number input appears. The vendor enters the reference number from the customer's payment confirmation (mBoB, mPay, RTGS). Stored as `payment_ref` on the order. Input auto-focuses when method is selected.

**Credit**: triggers `CustomerOtpModal` before completing the order. A khata account is auto-created for new customers. Legacy `MBOB`/`MPAY`/`RTGS` values were migrated to `ONLINE` (migration 064).

Both POS modes (keyboard and touch) use the same three payment methods. Touch POS shows the journal number input inline in the cart panel when Online is selected.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Any printable | Open product search with that character pre-filled |
| F1 | Help overlay |
| F2 | New transaction (clears cart, confirm if items present) |
| F3 | Open product search (empty) |
| F4 | Hold cart and open new blank cart |
| F5 | Open payment modal (requires items) |
| F6 | Cancel active cart |
| F7 / Delete | Void selected row |
| F9 | Switch to Touch Mode |
| Tab | Next cart |
| Shift+Tab | Previous cart |
| Ctrl+1–9 | Jump to cart by number |
| ↑↓ | Navigate cart rows |
| Enter | Edit qty on selected row |

---

## Multi-Cart

Up to 9 simultaneous carts. F4 holds the current cart and opens a new blank one. Each cart persists in the `carts` table with `status = ACTIVE`. Tab bar shows item count badges. X on tab cancels that cart.

---

## Stock Deduction Flow (POS Sale)

1. Order INSERT at `PENDING_PAYMENT`
2. `order_items` INSERT with `batch_id` populated from search result
3. Order UPDATE to `CONFIRMED`
4. `guard_stock_on_confirm` (BEFORE UPDATE) — raises exception if batch quantity insufficient
5. `deduct_stock_on_confirm` (AFTER UPDATE) — inserts SALE `inventory_movements` per item with `batch_id`
6. `sync_batch_quantity` (AFTER INSERT on `inventory_movements`, SECURITY DEFINER) — decrements `product_batches.quantity`
7. `auto_deplete_batch` (BEFORE UPDATE on `product_batches`) — sets `status = DEPLETED` when `quantity ≤ 0`

---

## Navigation & Breadcrumbs

All POS pages share a consistent breadcrumb: `POS / Section / Detail`. Back navigation from order detail returns to the correct tab (SO, SI, POS, etc.) via `?section=SALES&tab=SO` query params.

---

## Files

| File | Purpose |
|------|---------|
| `app/pos/page.jsx` | Keyboard POS main page (route `/pos`) |
| `app/pos/touch/page.jsx` | Touch POS (route `/pos/touch`) |
| `components/pos/keyboard/cart-table.jsx` | Cart table with Batch and Stock columns |
| `components/pos/keyboard/product-search-modal.jsx` | Fullscreen search, entity-scoped batch queries |
| `components/pos/keyboard/payment-modal.jsx` | Payment modal, 3 methods, denomination tiles |
| `components/pos/keyboard/shortcut-bar.jsx` | Context-aware bottom shortcut bar |
| `components/pos/keyboard/help-overlay.jsx` | F1 help overlay |
| `hooks/use-cart.js` | Multi-cart state, cart_items CRUD with batch join |
