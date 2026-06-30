# Pelbu Desktop POS — P2/P3/P4 Parity Plan

Porting the web keyboard-POS redesign (Phases 2–4) to the **desktop** app
(Electron + embedded PocketBase, offline-first). Companion to
`web/docs/pelbu-ui-change-spec.md`.

**Status (2026-06-24):**
- **P1–P4 — ALL DONE & VERIFIED (linux/arm64 native build).** Commits on
  `feat/web-pos-ui-overhaul`: `d522920` (P1), `f6b3871` (P2), `3a269dc` (P3),
  `7d32198` (P4). Each phase: `tsc --noEmit` + `npm run build` pass green.
- **Needs runtime verify (this box can't run embedded PocketBase):** PB
  migrations `007`–`010` run on terminal startup; `009` extends
  `orders.order_type` via `field.values=[...]`; `010` creates the `refunds`
  collection. Sync: `doSync` carries the new order fields, but `refunds` +
  `products.visible_on_web` are not yet pushed (cloud-ingest follow-up).
  Complimentary assumes PaymentModal accepts a 0-total CASH tender.

> Source-of-truth mapping produced by a 4-agent read-only fan-out (3 per-phase +
> 1 cross-phase synthesizer). All four agreed → high confidence.

---

## Cross-phase: shared files & implementation order

Three files are touched across phases and are the merge-risk surface:

| File | P1 (done) | P2 | P3 | P4 |
|---|---|---|---|---|
| `desktop/app/page.tsx` | ✓ | ✓ | ✓ | ✓ **(heavy)** |
| `desktop/hooks/use-pos-shortcuts.ts` | ✓ | — | ✓ (2 stubs) | ✓ (6 stubs) |
| `desktop/components/pos/help-overlay.tsx` | ✓ | — | ✓ (2 entries) | ✓ (6 entries) |

`app/page.tsx` is touched by **all four** phases — keep each phase's diff surgical.

**Order: P2 → P3 → P4, strictly sequential, one commit per phase** (mirrors the
web cadence: `28e33cc` P3, `8b61c49` P4).
- **P2 first** — introduces the header invoice badge that P3's double-click
  anchors onto; touches only `page.tsx` of the shared files (clean landing).
- **P3 second** — needs P2's badge; first `use-pos-shortcuts`/`help-overlay`
  edits (F7, Alt+A).
- **P4 last** — largest (6 flows); its shared-file edits land once against a
  stable post-P3 base. For P4, add all six `PosShortcutsInput` props + `page.tsx`
  state vars **upfront as no-ops in one commit**, then implement each flow's
  modal/migration incrementally — avoids 6 rounds of conflict on the interface
  block.

---

## Phase 2 — Customer panel + live invoice header

### Customer panel (UPGRADE existing, not net-new)
Desktop **already** has F6 → `CustomerModal` and the data is already local:
`khata_accounts` carries `debtor_phone`, `debtor_name`, `party_type`, 
`outstanding_balance`, `credit_limit`, `status` (`ACTIVE/FROZEN/CLOSED`).
Work = upgrade the modal (`components/pos/customer-modal.tsx`, currently a card
list) to the web's **4-column table** (Mobile / Name / Type / Outstanding):
- Leading **Walk-in** row → `onSelect(null)` (widen `onSelect` to
  `Customer | null`; clear `selectedCustomer` on Walk-in).
- `status === 'FROZEN'` → row disabled/blocked; `outstanding_balance >=
  credit_limit` → orange "over limit" badge (advisory; checkout already enforces
  the hard block in `use-checkout.ts`).
- `TYPE_LABELS` map; PB only has `CONSUMER/RETAILER/WHOLESALE` (no `SUPPLIER`)
  → use `??` fallback so a synced SUPPLIER row still renders.
- Add `party_type?: string` to the `Customer` interface (`use-customers.ts`);
  `fetchCustomers` already returns it (no projection).
- Keep the desktop-only "Add New Customer" form, below the table.

### Live invoice header (offline-first adaptation — NOT a 1:1 port)
Web peeks a **cloud** counter (`pos_order_counters`) + cloud time. Desktop has
neither; it mints `POS-{TERMINAL}-{YYYYMMDD}-{NNNN}` at checkout by counting
today's orders (`use-checkout.ts:112-117`) and reads time from the local clock.
- **Next-invoice preview:** extract that count+1 into `peekNextOrderNo(pb,
  terminalId)` in `desktop/lib/gst.ts` (next to `generateOrderNo`). Call on
  mount + 60s interval + after each sale. It's a *peek*, not a reservation —
  same caveat the web documents (displayed no. can differ under concurrent
  terminals; the `POS-{TERMINAL}-` prefix prevents real collisions).
- **Server time:** treat the **local system clock as authoritative** (Windows
  NTP-syncs by default). The real feature is the admin date-override; the time
  source is incidental. Optional hardening: best-effort cloud-time fetch in
  `electron/main.js` with local fallback — defer.
- **Admin date-override popover:** gate on `role === 'owner' || 'manager'`
  (web uses `OWNER/ADMIN`). For true 403-parity, enforce at the PB layer via a
  new `pb_hooks/orders.js` `OnRecordBeforeCreateRequest` hook (app-layer guard
  in `use-checkout.ts` is the pragmatic minimum).
- **Pre-checkout Inv-no badge** in the header (next to the clock).

### PocketBase migration
`pb/pb_migrations/007_invoice_date.js` — add `invoice_date` (`date` field) to
`orders`; backfill `invoice_date = created_at`. PB `date` stores ISO strings;
`use-checkout.ts` writes `invoice_date: dateOverride ?? nowISO()`. No declarative
index (skip until the GST/reporting phase). **Checkout change:** add
`invoice_date` + accept `invoiceDate?: string|null` and `isOwner?: boolean` in
`CheckoutInput`.

### Files
- **NEW:** `pb/pb_migrations/007_invoice_date.js`; `lib/invoice-header.ts`
  (`peekNextOrderNo`); `components/pos/admin-date-popover.tsx`;
  *(optional)* `pb_hooks/orders.js`.
- **EDIT:** `components/pos/customer-modal.tsx`; `hooks/use-customers.ts`;
  `hooks/use-checkout.ts`; `app/page.tsx` (badge + override + state +
  `handleSelectCustomer(null)` + pass `invoiceDate` to checkout).
- **Pre-existing bug to fix in the same commit:** `app/page.tsx:148-149` is a
  stray duplicated `anyModalOpen` expression (paste artifact) — the header work
  touches that region.
- **NOT touched:** `use-pos-shortcuts.ts`, `help-overlay.tsx` (F6 already wired).

---

## Phase 3 — Price-list toggle + invoice lookup

### Price-list toggle (Retail / Wholesale / Distributor)
F7 + Alt+A (currently stubs) cycle tiers; switching re-prices the cart; tier
persists in `localStorage['pos_price_list']`.
- **Re-price via `overridePrice`, NOT `applyDiscount`.** `overridePrice`
  (`use-cart.ts:201-222`) recomputes GST while **preserving per-line `discount`**
  — matches the web. `applyDiscount` would fight the reprice (clamps to
  `unit_price`). Add `repriceCart(mode)` to `use-cart.ts` (mirror
  `web/hooks/use-cart.js:227-245`).
- **`priceFor(product, mode)` ladder** (new `lib/price-list.ts`): RETAIL
  `sale_price→mrp→wholesale_price`; WHOLESALE `wholesale_price→mrp`;
  DISTRIBUTOR `distributor_price→wholesale_price→mrp`. Note desktop's
  `sale_price` = web's `selling_price`.
- **Gotcha:** expanded `product` on a cart line can be stale. `repriceCart`
  should **re-read each product from PB** before computing the tier price (web
  side-steps this with a `?ids=` refetch).
- Thread `priceListMode` into `useCart()` so newly-added lines price at the
  active tier (`addItem` currently always uses `sale_price`).

### Invoice lookup
- **Direct PB query** (no API route — desktop has no Next API layer in the
  Electron runtime). PB has **no regex/ILIKE** → use `order_no LIKE "%...%"`.
- **`26/1` shorthand** → `order_no LIKE "%-2026-00001%"` (5-digit zero-padded
  serial). Free-text → `order_no OR customer_name OR buyer_whatsapp`.
- **Target view already exists:** `desktop/app/orders/detail/page.tsx` (reads
  `?id=`). Navigate to `/orders/detail?id=${order.id}` — **no new detail route.**
- Port `web/components/pos/keyboard/invoice-search-modal.jsx` →
  `desktop/components/pos/invoice-search-modal.tsx` (keep debounce + seq guard).
- Trigger: double-click the **P2 invoice badge** → open the modal.

### PocketBase migration
`pb/pb_migrations/008_distributor_price.js` — add `distributor_price` (`number`,
default 0) to `products`. PB `number` has no real NULL → treat `0`/falsy as
"unset → fall back to wholesale_price" (consistent with existing `sale_price`
convention). Add `distributor_price: number` to the `Product` interface
(`use-products.ts`); expose in `product-form-modal.tsx` for admin entry.

### Files
- **NEW:** `pb/pb_migrations/008_distributor_price.js`;
  `components/pos/invoice-search-modal.tsx`; *(optional)* `lib/price-list.ts`.
- **EDIT:** `hooks/use-cart.ts` (`priceListMode` param, `repriceCart`,
  `addItem` tier price); `hooks/use-products.ts`; `hooks/use-pos-shortcuts.ts`
  (F7 + Alt+A real handlers); `components/pos/help-overlay.tsx` (move F7/Alt+A
  to Functional); `components/pos/product-form-modal.tsx`; `app/page.tsx`
  (`priceListMode` state + localStorage, badge, double-click wiring,
  `<InvoiceSearchModal>`, pass `priceListMode` to `useCart`).

---

## Phase 4 — Six net-new flows

All six are currently `stub(...)` toasts in `use-pos-shortcuts.ts` (lines 69,
90, 91, 95, 96, 97). Summary:

| Flow | Key | Local/cloud | PB delta | Manager gate |
|---|---|---|---|---|
| Sales Person | F8 | local `users`, sync-flagged | `orders.salesperson_id` (relation) | No |
| Quotation | Alt+Q | purely local | `order_type += SALES_ORDER` | No |
| Complimentary | Ctrl+C | purely local math | (optional `complimentary_reason`) | **Yes** |
| Exchange | Ctrl+E | local, sync-flagged | **new `refunds` collection** | **Yes** |
| Post to Market | Alt+M | local write, sync-flagged | `products.visible_on_web` + `is_synced` | No |
| Delivery Address | Alt+D | purely local | `orders.delivery_address` | No |

### Per-flow notes
- **Sales Person (F8):** picker queries local `_pb_users_auth_` (no
  `user_profiles`/`sub_role`/`full_name` on desktop → use `name` + `role`).
  Store `orders.salesperson_id`; sync maps local `users.id` → cloud
  `user_profiles.id` (terminal-user-sync already mirrors these).
- **Quotation (Alt+Q):** checkout branch — `order_type: SALES_ORDER`,
  `status: DRAFT`, **skip** stock-decrement + khata batch. Add an explicit
  `mode: 'quotation' | 'sale'` param to `use-checkout.ts` to avoid partial
  writes. Desktop `order_type` enum lacks `SALES_ORDER` (has `POS_SALE/
  WHOLESALE/MARKETPLACE`) → extend it. `status: DRAFT` already exists.
  Convert-DRAFT→sale is a follow-up (web lacks it too).
- **Complimentary (Ctrl+C):** `applyDiscount(it.id, it.unit_price)` per line →
  GST on 0. **Requires adding `isManager` to `PosShortcutsInput`** (shortcut
  layer has no role awareness today). Optional `complimentary_reason` text on
  `orders` for audit (desktop-only enhancement).
- **Exchange (Ctrl+E) — HEAVIEST.** Needs a **new `refunds` collection**
  (desktop has none; web has a `refunds` table). Desktop stores items as a JSONB
  `items[]` on `orders` (no `order_items` collection, no per-row FK) → **cannot
  use web's trigger-based stock restore**. Instead, in one `pb.createBatch()`:
  write `refunds` rows, `products.current_stock+`, `inventory_movements`
  (`movement_type: RETURN` — already in the enum), set `orders.status=REFUNDED`
  + `refund_amount`, and reverse khata for credit sales. Manager-gated. GST
  reversal proportional per returned line (web `/refund` math).
  **Offline caveat:** only orders present *on this terminal* are returnable.
- **Post to Market (Alt+M):** flip `products.visible_on_web` locally; the
  marketplace read-side is cloud-only, so the flag only matters after sync.
  `products` currently has **no `is_synced`** → add it (and register `products`
  in `reset_sync_on_update.pb.js`).
- **Delivery Address (Alt+D):** free text → `orders.delivery_address`. Simplest.

### PocketBase migrations (consolidate P4 into one or two files)
- `009_phase4_fields.js`: `orders.salesperson_id` (relation→users),
  `orders.delivery_address` (text), `orders.complimentary_reason` (text),
  extend `orders.order_type` (+`SALES_ORDER`), `products.visible_on_web` (bool),
  `products.is_synced` (bool).
- `010_refunds.js`: new `refunds` collection (order, order_item_id, product,
  quantity, refund_type FULL/PARTIAL, amount, gst_reversal, reason,
  requested_by, approved_by, status, is_synced, timestamps).
- Register `refunds` + `products` in `pb_hooks/reset_sync_on_update.pb.js`.

### Files
- **NEW:** `pb/pb_migrations/009_phase4_fields.js`, `010_refunds.js`; 6 modals
  (`salesperson-picker`, `quotation-confirm`, `complimentary-confirm`,
  `exchange`, `post-market`, `delivery-address`); `hooks/use-exchange.ts`.
- **EDIT:** `hooks/use-pos-shortcuts.ts` (replace 6 stubs + add `isManager`);
  `hooks/use-checkout.ts` (salesperson/delivery/complimentary/quotation branch);
  `hooks/use-auth.ts` is fine (`isManager` exists at line 57-59); `app/page.tsx`
  (6 states + modals + wiring + checkout payload); `help-overlay.tsx` (move 6
  to Functional); `electron/main.js` (**sync payload**).

---

## Migration summary

| Migration | Phase | Collection | Change |
|---|---|---|---|
| `007_invoice_date.js` | P2 | `orders` | + `invoice_date` (date), backfill from `created_at` |
| `008_distributor_price.js` | P3 | `products` | + `distributor_price` (number, default 0) |
| `009_phase4_fields.js` | P4 | `orders`/`products` | + salesperson_id, delivery_address, complimentary_reason; order_type += SALES_ORDER; visible_on_web, is_synced |
| `010_refunds.js` | P4 | `refunds` (new) | exchange/return ledger |

**Ordering caveat:** existing migrations are `000`–`006` + timestamp-named
`1777263886_updated_users.js`. New `007`–`010` sort **before** the timestamp
file lexicographically — fine (no dependency on the users `role` field), but
verify at implementation, or use timestamp-prefixed names to force them last.

---

## Highest risks (the easy-to-forget ones first)

1. **Sync payload (`electron/main.js` `doSync`/`doBootstrap`)** must carry the
   new fields (`invoice_date`, `salesperson_id`, `delivery_address`,
   `visible_on_web`, `refunds`) or cloud reconciliation **silently drops**
   them. Also confirm cloud `/api/sync/ingest` maps `invoice_date` and
   `salesperson_id` (local→cloud user id).
2. **`app/page.tsx` touched 4×** — keep each phase's diff surgical; resist
   refactoring neighbors.
3. **P4 Exchange** — new collection + atomic batch refund/stock-restore +
   khata reversal; diverges most from web (no RPC/trigger). Test atomicity
   against the existing batch pattern in `use-checkout.ts:168-194`.
4. **P4 Quotation checkout branch** — partial-write risk if the branch is
   wrong. Use an explicit `mode` param.
5. **P2 invoice-number peek** is display-only (not a reservation) — document.

## What desktop already has (no work)
- `khata_accounts` fields for the customer panel (P2).
- Canonical F-key map + Ctrl/Alt stubs (P1, `d522920`) — P3/P4 only replace
  stubs.
- Per-unit discount + bill-discount infra (P4 Complimentary reuses it).
- `inventory_movements` with `RETURN` type (P4 Exchange).
- Roles `owner/manager/cashier` (P2 admin-override + P4 manager-gate).
