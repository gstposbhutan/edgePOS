# Feature — Offline POS (core checkout)

**Status:** built · **Scope:** desktop retailer terminal.
**Related (web/docs/features):** `keyboard-checkout.md`, `multi-cart.md`, `line-item-discount.md`, `order-management.md`.

The heart of the terminal: a fully **offline** sell flow backed by the local PocketBase — no
connectivity required. Orders accumulate locally and push to the cloud later (see
[provisioning/sync](../../../web/docs/features/offline-sync.md)).

## Flow
Product (grid click / search / **barcode** / keyboard nav) → cart → **checkout** → payment →
receipt. Each line is **GST 5%, tax-exclusive** (`lib/gst.ts`); cart math runs through TanStack
Query mutations against `cart_items`.

## Key pieces
- `app/page.tsx` — the POS screen and shortcut wiring.
- `hooks/use-cart.ts` — active cart + `cart_items` CRUD. `addItem(product, weight?)` — `weight` is
  used only for `sold_by_weight` goods (the line stores `quantity = weight`, `unit_price = rate`).
- `hooks/use-checkout.ts` — order confirmation: stock guard, **credit-limit check** + khata debit on
  CREDIT, digital signature, inventory movements, order number.
- Multi-cart (hold/park), undo stack, F-key shortcuts, per-line discounts — see the linked docs.
- Payment methods: **CASH / CREDIT / ONLINE** (+ `payment_channel`); receipt via `receipt-modal`
  and the [thermal printer](thermal-printing.md).

## Data
`carts` / `cart_items` → `orders` (with a json `items` snapshot) + `inventory_movements` +
`khata_transactions`. Order numbers are a gapless per-store serial; the digital signature is
recomputable from `order_no:grand_total:tpn`.

## Notes
Business-logic integrity (credit-limit enforcement, refund/cancel double-apply guards, shift link,
sync-contract casing) was hardened to the canonical contract — see
[`../../../web/docs/desktop-web-parity-fix-plan.md`](../../../web/docs/desktop-web-parity-fix-plan.md).
