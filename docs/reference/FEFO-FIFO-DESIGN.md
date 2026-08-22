# FEFO / FIFO inventory — design (P8)

Design for meeting decision **D4** (the plan's P8 — highest-risk: touches money + stock).
Incorporates Shawn's intent (2026-08-13): *vendor picks per product; FEFO requires an expiry date;
FIFO leaves expiry optional.*

> ✅ **BROWSER-VERIFIED END-TO-END (Shawn, 2026-08-13).** The full web flow works correctly:
> set rotation (None/FIFO/FEFO) → receive with FEFO expiry enforcement → sell with auto per-batch
> allocation + pricing, older-batch warning, manual batch override, and race-safe deduction.
> Only **desktop parity** remains (`DESKTOP-PARITY.md`).

## Current model (audited)

- **`pos.product_batches`** carries `manufactured_at`, `expires_at`, `received_at`, `quantity`,
  `unit_cost`, `selling_price`, `mrp`, `status` (ACTIVE/EXPIRED/RECALLED/DEPLETED). It already has
  everything FEFO (expiry) and FIFO (received_at) need, plus per-batch cost/price retention.
  **Note:** POS tables live in the **`pos` schema** (migration 121 flip), not `public`.
- **Deduction** (`deduct_stock_on_confirm`, migration 114): on order → CONFIRMED, inserts **one**
  `inventory_movements` SALE row per `order_items` line carrying `oi.batch_id`. A movement *with* a
  batch draws that batch down; *without* one, only entity `products.current_stock`.
- **Availability** (BEFORE-confirm trigger): non-batch lines checked against `current_stock`;
  batch lines (`oi.batch_id` set) against that batch's `quantity`.
- **Batch choice is client-driven** — POS/checkout sends `item.batch_id ?? null`; there is **no
  automatic expiry/received ordering**. Nothing set a per-product rotation policy.

**Gap:** stock is deducted at the entity level (or from a manually-chosen batch). FEFO/FIFO means
the system automatically allocates each sale across the right batch(es) in expiry/received order.

## Model

1. **Per-product rotation flag.** `pos.products.stock_rotation text NOT NULL DEFAULT 'FIFO'`
   (`CHECK IN ('FEFO','FIFO','NONE')` — migration 129 + 130). Toggled in the product form (retailer + vendor).
   - **FEFO** = consume soonest-expiry first → **expiry required** on every batch of the product.
   - **FIFO** = consume oldest-received first → **expiry optional**.
   - **NONE** = no rotation policy — cashier bills any batch, **no warning**, expiry optional
     (inert to the FEFO triggers, like FIFO). For products where rotation doesn't matter.
2. **Receive-time enforcement** (DB triggers, all paths): a FEFO product's batches must have
   `expires_at`; switching a product to FEFO is blocked while expiry-less in-stock batches exist.
3. **Allocation order** when a sale deducts qty N of a batch-tracked product across its ACTIVE,
   in-stock batches:
   - **FEFO:** `ORDER BY expires_at ASC NULLS LAST, received_at ASC`
   - **FIFO:** `ORDER BY received_at ASC, id`
   Walk in order, consuming from each until N is met → **one movement per batch used** (a line can
   span several batches). Skip `EXPIRED`/`RECALLED`; guard against overshoot.
4. **Costing + pricing** come from the consumed batch (decision #2).

## Decisions (resolved 2026-08-13 with Shawn)

1. **Allocation runs → (A) DB, at confirm.** *Caveat (see #5):* because pricing is per-batch, the
   split must be *computed* when the sale is rung up so the cashier collects the right total — so the
   allocation lives in a shared `pos.allocate_batches(...)` function that checkout calls for pricing
   and confirm reuses for deduction.
2. **Price → (B) Batch price.** The consumed batch's `selling_price` is charged; old stock sells at
   its old price. A sale spanning 2 batches shows **2 price lines** on the receipt. `unit_cost` still
   recorded per movement for margin.
3. **Switch to FEFO with expiry-less in-stock batches → BLOCK** (clear message). ✅ enforced.
4. **Batch-tracked oversell → hard ERROR** (batch-tracked means batch-exact).
5. **FEFO override at checkout → (B) Default oldest, allow override.** Auto-select the soonest-expiring
   batch, but the cashier CAN pick a different one — show a warning when they skip an older batch.
   Rotation encouraged, not hard-blocked. (Resolved 2026-08-13.)

## Phasing

- **Phase A — ✅ DONE + deployed (migration 129).** `pos.products.stock_rotation` (default FIFO) +
  product-form toggle (retailer + vendor) + DB-enforced FEFO discipline: `pos.enforce_fefo_batch_expiry`
  (expiry required on every batch of a FEFO product, all receive paths) and `pos.enforce_fefo_switch`
  (block the FIFO→FEFO switch while expiry-less stock exists). Create routes also guard the opening
  batch (create isn't transactional). No deduction change yet. Both triggers smoke-tested (rolled back).
- **Phase B — partially shipped.**
  - ✅ **FEFO cashier warning (`84acd51`)** — `/api/products/sellable` now returns `stock_rotation`,
    `earliest_batch_expiry`, `has_older_batch`; the sale screen shows a non-blocking amber warning
    when a cashier adds a non-oldest batch of a FEFO product (decision #5B, advisory half). Deduction
    + pricing untouched.
  - ✅ **Auto-split across batches (`05215f1`)** — **key finding:** per-batch pricing + deduction
    already work (cart lines carry `batch_id` + the batch `selling_price`; `deduct_stock_on_confirm`
    draws per batch), so decision #2 was already satisfied at the line level and the deduction did NOT
    need a rewrite. `GET /api/pos/allocate?product&qty` returns the FEFO/FIFO-ordered split; the
    keyboard/search add path (`handleProductAdd`) auto-splits a quantity across batches (oldest first)
    as separate per-batch lines, replacing the manual "search again" flow. Ordering unit-tested
    (FIFO/FEFO/insufficient). Confirm-time availability trigger is the oversell backstop.
  - ✅ **Qty-increase auto-split (`4ea4d78`)** — raising a batch line past its stock now caps that
    batch and splits the overflow across the product's other batches (oldest first), each at its batch
    price. Wired on **both** `/pos` (keyboard cart) and `/pos/touch`; `updateQty` returns the cap,
    `/api/pos/allocate?exclude=` skips the current batch.
  - ✅ **Explicit batch-override picker (`5651ff8`)** — a "⇄ change batch" affordance on every cart
    line (keyboard + touch) opens a picker of the product's in-stock batches (oldest first, expiry/qty/
    price); `cart/items` `change_batch` action switches the line + re-prices to that batch.
  - ✅ **'None' rotation option (`5651ff8`, migration 130)** — a product can opt out of FEFO/FIFO;
    cashier bills any batch, no warning.
  - ✅ **Concurrency hardening (`2374d42`, migration 131)** — `sync_batch_quantity` /
    `apply_inventory_movement` now do an **atomic guarded decrement** for SALE movements
    (`... AND quantity >= sold`); the row lock serializes concurrent sales and the loser's guard
    fails → RAISE → its confirm transaction rolls back. Closes the oversell race (two terminals both
    passing the stale availability check then both deducting). Verified: oversell raises, normal sale
    succeeds. Non-sale movements unchanged.
  - ⬜ **Remaining:** desktop parity (in `DESKTOP-PARITY.md`). Web Phase B is functionally complete.
- **Phase C:** per-batch cost flows into profitability (ties to P15).

*Generated 2026-08-13. Phase A shipped; decision #5 open before Phase B.*
