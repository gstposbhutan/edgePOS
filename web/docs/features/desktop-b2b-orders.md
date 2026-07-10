# Feature: Desktop B2B order fulfilment for distributor/wholesaler terminals

**Feature ID**: F-DESK-B2B-001
**Status**: Built — web routes deployed + gated; desktop compiles (`next build` + `tsc` clean). **Runtime-unverified**: needs an on-terminal build/test (PB boot + pull/fulfil round-trip) before rollout.
**Platform**: Desktop POS terminal (Electron + embedded PocketBase + Next.js), BACK_OFFICE mode
**Phase**: 4 (desktop follow-on) of the distributor/wholesaler parity plan

> This is the desktop half of Phase 4. The web half (console Terminals management) shipped in
> `5e6f140`. Warehouse-level stock stays web-only; the desktop terminal works entity-level.

---

## 1. Goal & current state

A distributor/wholesaler runs **warehouse** back-office terminals (no cash-sale POS). When such a
terminal activates, its license forces **BACK_OFFICE** mode and the app redirects to `/stock`. Today:

- ✅ **Stock works** — `/stock` (products, inventory, PO/restock, barcode) reads the local PocketBase,
  which the Electron main process syncs from the cloud. A tier's products sync down, so entity-level
  stock management already functions. (Per-warehouse `warehouse_stock` is web-only and stays there.)
- ✅ **No cash sale** — enforced by BACK_OFFICE mode.
- ❌ **Incoming B2B orders** — the terminal cannot see or fulfil the WHOLESALE orders where its entity
  is the seller. The existing `online_orders` mirror is **marketplace-only** (consumer orders).

**This feature adds incoming B2B order fulfilment to the terminal**, mirroring the proven
online-orders sync pipeline (cloud feed → Electron main pull → local PocketBase mirror → read-only
Next.js page → fulfil action → status pushed back to the cloud).

---

## 2. Architecture — mirror the online-orders pipeline

The online-orders feature is the template. Reuse its shape wherever possible:

```
Cloud (Supabase)                Electron main (Node)              Local PocketBase        Renderer (Next.js)
────────────────                ───────────────────              ────────────────        ─────────────────
GET  b2b incoming feed   ──►  pull on interval + on focus  ──►  upsert `b2b_orders`  ──►  /b2b-orders page
(seller_id = my entity)        (auth: terminal sync token)       (mirror, cloud_id)        (list + fulfil)
PATCH order status       ◄──  push status change            ◄──  action writes intent  ◄──  Confirm/Dispatch
(fires console triggers)
```

### 2a. Cloud feed + writeback (web)
- **Feed** — `GET /api/sync/b2b-orders` (new): returns the terminal entity's incoming WHOLESALE orders
  (`seller_id = <entity resolved from the sync token>`, `order_type = 'WHOLESALE'`, actionable
  statuses CONFIRMED/PROCESSING/DISPATCHED/DELIVERED), with buyer name + items. Authenticated by the
  **terminal sync token** (same header the online-orders feed uses), which resolves `entity_id` +
  `register_id` — NOT a user session. Mirror the online-orders feed route exactly.
- **Writeback** — `PATCH /api/sync/b2b-orders/[id]` (new): advances the order status
  (PROCESSING/DISPATCHED/DELIVERED/COMPLETED, or CANCELLED) — the same transitions as the web
  `/api/console/orders/[id]` state machine — so all the DB triggers (stock return on cancel, khata,
  buyer receive-on-buy idempotency) fire cloud-side exactly as on the web. Token-auth, and it MUST
  verify `seller_id = the token's entity` before updating (tenant isolation).
- Both routes resolve the entity from `terminal_tokens` (sha256 of the token) → `entity_id`, the same
  way `/api/sync/ingest` and the online-orders feed authenticate.

### 2b. Local mirror (PocketBase migration)
- New migration `desktop/pb/pb_migrations/0NN_b2b_orders.js` — a `base` collection `b2b_orders`,
  read-only to the renderer (write rules null; only the Electron main writes it), mirroring
  `017_online_orders.js`:
  - fields: `cloud_id` (text, unique index), `order_no`, `buyer_name`, `status`, `payment_method`,
    `subtotal`, `gst_total`, `grand_total`, `items` (json), `created_at_cloud` (text/date),
    `synced_at` (autodate), plus a `pending_status` (text, nullable) the renderer sets to request a
    transition the main process then pushes.
  - **Migration safety:** PocketBase rejects partial-index WHERE clauses with parentheses (the
    v1.0.2→v1.0.3 boot brick). Keep the unique index a plain `CREATE UNIQUE INDEX ... (cloud_id)` with
    no WHERE, and include a down-migration (`app.delete(...)`). Runtime-verify boot after adding.
- Reuse the online_orders access-rule pattern (renderer read-only; main process writes via admin).

### 2c. Electron main (sync)
- In `desktop/electron/main.js`, alongside the online-orders pull: add a `pullB2BOrders()` that
  `fetch`es `GET /api/sync/b2b-orders` with the sync token, then upserts each into `b2b_orders` on
  `cloud_id` (create or update). Run it on the same debounced/interval cadence + on window focus.
- Add a `pushB2BStatus()` step: find local `b2b_orders` rows with a non-null `pending_status`, `PATCH`
  `/api/sync/b2b-orders/[cloud_id]`, and on success clear `pending_status` (the next pull reflects the
  authoritative new status). Mirror how online-order status changes are pushed back.
- Gate the whole thing to BACK_OFFICE terminals whose entity is a tier (skip for retailer POS
  terminals) to avoid needless polling.

### 2d. Renderer (Next.js on the terminal)
- New `desktop/app/b2b-orders/page.tsx` + `desktop/hooks/use-b2b-orders.ts` reading `b2b_orders` from
  local PocketBase via TanStack Query (mirror `use-online-orders`). List incoming orders (buyer, no.,
  total, status, items) with fulfil actions: **Start processing → Mark dispatched → Mark delivered →
  Complete**, and **Cancel**. An action sets the row's `pending_status` locally (instant, offline-safe)
  and shows "syncing…"; the main process pushes it and the next pull confirms.
- Add a nav link on the BACK_OFFICE terminal (`desktop/app/page.tsx` header) — shown for
  owner/manager, next to Stock and Online orders. For a tier terminal, B2B orders is the primary
  fulfilment surface.

---

## 3. What deliberately stays out
- **Per-warehouse stock on the terminal** — web-only. Desktop stock is entity-level.
- **B2B *selling* (creating orders) on the terminal** — selling is a web console action (SellToBuyer);
  the terminal only *fulfils* incoming orders.
- **PO/PI + khata management on the terminal** — web console. (Stock receiving via `/stock` restock
  already exists entity-level.)
- **GST/ITC reporting** — web/admin-hub only (the terminal already produces correct per-line GST that
  syncs up).

---

## 4. Offline behaviour
- Reads are always instant (local mirror). Fulfil actions queue via `pending_status` and flush when
  connectivity returns — consistent with the terminal's offline-first design. The cloud order state
  machine is the source of truth; a conflicting cloud status (e.g. buyer cancelled) wins on next pull.

---

## 5. Release steps (this is a desktop release, not a hot web deploy)
1. Land the two cloud routes (web) — deployable independently; harmless until a terminal calls them.
2. Add the PocketBase migration + main-process sync + renderer page/hook/nav (desktop).
3. **Runtime-verify on a built terminal**: PocketBase boots (migration applies, collections HTTP 200),
   a tier BACK_OFFICE terminal pulls its incoming B2B orders, a fulfil action round-trips to the cloud
   and the web console reflects the new status.
4. Bump desktop version, build the signed installer, publish via the desktop releases feature, and
   roll to tier terminals. Sequence with the pending desktop v1.3.x release.

---

## 6. Verification checklist
- [ ] `GET /api/sync/b2b-orders` returns only the token-entity's WHOLESALE incoming orders; 401 without a valid token; never another entity's orders.
- [ ] `PATCH /api/sync/b2b-orders/[id]` rejects an order whose `seller_id` ≠ the token entity; valid transitions fire the same triggers as the web state machine.
- [ ] PB migration applies cleanly; terminal boots; `b2b_orders` reachable.
- [ ] A CONFIRMED order appears on the terminal; Dispatch → status pushes; web console shows DISPATCHED.
- [ ] Offline: action queues (`pending_status`), flushes on reconnect.
- [ ] Cancel returns seller stock + reverses khata cloud-side (unchanged from web).
