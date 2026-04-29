# Feature: Multi-Store Management

**Feature ID**: F-MSTORE-001
**Phase**: 3
**Status**: Partially complete — store selector + creation done; stock transfers pending
**Last Updated**: 2026-04-29

## Implementation Status (2026-04-29)

### ✅ Completed
- **Migration 050** — `owner_stores` junction table (owner_id, entity_id, is_primary). Back-fills existing OWNER users.
- **`hooks/use-owner-stores.js`** — fetches all stores for an OWNER, exposes `createStore`
- **POS header store selector** — dropdown shown when owner has 2+ stores; switches full POS context (products, cart, orders, khata all re-scope to new entity_id)
- **`/admin/stores` page** — owner creates new stores; each is auto-linked via `owner_stores`
- **`GET/POST /api/admin/stores`** — list owned stores + create new store + link
- **`proxy.js`** — RETAILER+OWNER now allowed through to `/admin/*`
- **Admin sidebar** — Stores nav item visible to all admin users; role-filtered so OWNER only sees Stores/Team/Settings

### ⏳ Pending
- Stock transfers between owned stores
- Cross-store aggregated reports in admin hub
- SUPER_ADMIN assigning existing entities to an owner

---

## Original Specification
**Last Updated**: 2026-04-19
**Dependencies**: F-DESKTOP-001, F-SYNC-001, F-AUTH-001 (RLS infrastructure)

---

## Overview

Allows a single business owner to operate and manage multiple retail store locations from one account. The owner sees all stores in a unified dashboard — aggregated stock levels, combined sales reports, and a single P&L view — while each store retains independent GST filing, shift management, and staff rosters. Stock can be transferred between owned locations with a full audit trail and receiving confirmation workflow.

Both the desktop Electron app and the mobile PWA expose the owner dashboard. Staff accounts remain scoped to a single store and cannot see cross-store data.

---

## Data Model

### New Tables

**`owner_stores`** — Junction table linking an owner's user profile to every entity (store) they control.

```sql
CREATE TABLE owner_stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_owner_entity UNIQUE (owner_profile_id, entity_id),
  CONSTRAINT max_one_primary EXCLUDE (
    owner_profile_id WITH =
    WHERE (is_primary = TRUE
           AND owner_profile_id = owner_profile_id)
  )  -- only one primary store per owner
);

CREATE INDEX idx_owner_stores_owner ON owner_stores(owner_profile_id);
CREATE INDEX idx_owner_stores_entity ON owner_stores(entity_id);
```

**`stock_transfers`** — Tracks the lifecycle of a stock movement between two stores owned by the same owner.

```sql
CREATE TABLE stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id  UUID NOT NULL REFERENCES entities(id),
  to_entity_id    UUID NOT NULL REFERENCES entities(id),
  status          TEXT NOT NULL DEFAULT 'INITIATED'
                  CHECK (status IN ('INITIATED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  items           JSONB,               -- snapshot of requested items at initiation time
  initiated_by    UUID NOT NULL REFERENCES user_profiles(id),
  received_by     UUID REFERENCES user_profiles(id),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at     TIMESTAMPTZ,
  notes           TEXT,

  CONSTRAINT chk_different_stores CHECK (from_entity_id <> to_entity_id)
);

CREATE INDEX idx_stock_transfers_from ON stock_transfers(from_entity_id);
CREATE INDEX idx_stock_transfers_to ON stock_transfers(to_entity_id);
CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
```

**`stock_transfer_items`** — Line-level detail for each product in a transfer.

```sql
CREATE TABLE stock_transfer_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id         UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  quantity_requested  INTEGER NOT NULL CHECK (quantity_requested > 0),
  quantity_received   INTEGER CHECK (quantity_received >= 0),  -- NULL until received
  notes               TEXT,

  CONSTRAINT uq_transfer_product UNIQUE (transfer_id, product_id)
);

CREATE INDEX idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);
```

### Schema Changes to Existing Tables

**`user_profiles`** — No structural change. The existing `entity_id` column becomes the staff member's *assigned* store. For owners, `entity_id` points to their primary store, and `owner_stores` holds the full list.

**`inventory_movements`** — The existing `movement_type` CHECK constraint must be extended to include `TRANSFER_OUT` and `TRANSFER_IN`. The `reference_id` column links to `stock_transfers.id` for these types.

```sql
-- Existing movement_type values: SALE, RESTOCK, TRANSFER, LOSS, DAMAGED
-- Add:
--   TRANSFER_OUT  (deducted from source store)
--   TRANSFER_IN   (added to destination store on receipt confirmation)
```

**`entities`** — No structural change. Each store remains its own `entities` row with its own `tpn_gstin`, `whatsapp_no`, and settings.

---

## Owner Identity & JWT Claims

### Modified JWT Hook

The `custom_access_token_hook` Postgres function (defined in F-AUTH-001) is extended to include all entity IDs the owner manages:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims    JSONB;
  profile   RECORD;
  store_ids UUID[];
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles WHERE id = (event->>'user_id')::UUID;

  claims := event->'claims';
  claims := jsonb_set(claims, '{entity_id}',  to_jsonb(profile.entity_id));
  claims := jsonb_set(claims, '{role}',        to_jsonb(profile.role));
  claims := jsonb_set(claims, '{sub_role}',    to_jsonb(profile.sub_role));
  claims := jsonb_set(claims, '{permissions}', to_jsonb(profile.permissions));

  -- If owner, collect all managed entity IDs
  IF profile.sub_role = 'OWNER' THEN
    SELECT array_agg(os.entity_id) INTO store_ids
    FROM owner_stores os
    WHERE os.owner_profile_id = (event->>'user_id')::UUID;

    claims := jsonb_set(claims, '{entity_ids}', to_jsonb(COALESCE(store_ids, ARRAY[]::UUID[])));
  ELSE
    claims := jsonb_set(claims, '{entity_ids}', to_jsonb(ARRAY[profile.entity_id]));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### JWT Claim Summary

| Claim | Owner | Staff |
|-------|-------|-------|
| `entity_id` | Primary store UUID | Assigned store UUID |
| `entity_ids` | Array of all owned store UUIDs | Single-element array with assigned store |
| `role` | RETAILER / WHOLESALER | RETAILER / WHOLESALER |
| `sub_role` | OWNER | MANAGER / CASHIER / STAFF |

---

## Row-Level Security

### Owner Cross-Store Access

RLS policies on entity-scoped tables are updated to allow owners to read data across all their stores:

```sql
-- Transactions: owner can read all owned stores
CREATE POLICY "owner_multi_store_read" ON transactions
  FOR SELECT USING (
    seller_id = ANY(
      SELECT os.entity_id FROM owner_stores os
      WHERE os.owner_profile_id = (
        SELECT up.id FROM user_profiles up
        WHERE up.id = (auth.jwt() ->> 'sub')::UUID
      )
    )
    AND (auth.jwt() ->> 'sub_role') = 'OWNER'
  );

-- Inventory: owner can read stock levels across all stores
CREATE POLICY "owner_multi_store_inventory" ON inventory_movements
  FOR SELECT USING (
    entity_id = ANY(
      SELECT os.entity_id FROM owner_stores os
      WHERE os.owner_profile_id = (
        SELECT up.id FROM user_profiles up
        WHERE up.id = (auth.jwt() ->> 'sub')::UUID
      )
    )
    AND (auth.jwt() ->> 'sub_role') = 'OWNER'
  );
```

### Staff Isolation

Staff accounts continue to use the existing single-entity RLS policy. No changes needed — staff JWT contains only their assigned `entity_id`, and the existing `tenant_isolation` policy restricts reads and writes to that single entity.

### Transfer-Specific RLS

```sql
-- Owners can create transfers between their own stores only
CREATE POLICY "owner_transfer_create" ON stock_transfers
  FOR INSERT WITH CHECK (
    from_entity_id = ANY((auth.jwt() ->> 'entity_ids')::UUID[])
    AND to_entity_id = ANY((auth.jwt() ->> 'entity_ids')::UUID[])
    AND (auth.jwt() ->> 'sub_role') = 'OWNER'
  );

-- Both source and destination store staff can view transfers involving their store
CREATE POLICY "transfer_visibility" ON stock_transfers
  FOR SELECT USING (
    from_entity_id = ANY((auth.jwt() ->> 'entity_ids')::UUID[])
    OR to_entity_id = ANY((auth.jwt() ->> 'entity_ids')::UUID[])
  );

-- Only destination store staff or owner can mark as received
CREATE POLICY "transfer_receive" ON stock_transfers
  FOR UPDATE USING (
    (to_entity_id = ANY((auth.jwt() ->> 'entity_ids')::UUID[])
     AND (auth.jwt() ->> 'sub_role') IN ('OWNER', 'MANAGER'))
    OR (auth.jwt() ->> 'sub_role') = 'OWNER'
  );
```

---

## Cross-Store Inventory View

### Owner Dashboard (Desktop & PWA)

The owner dashboard displays stock levels across all owned stores in a single view.

**Inventory Table Columns:**

| Column | Description |
|--------|-------------|
| Product | Product name with thumbnail |
| Store A | Current stock at Store A |
| Store B | Current stock at Store B |
| ... | One column per owned store |
| Total | Aggregated stock across all stores |
| Low Stock | Red indicator if any store is below threshold |

**Filtering:**
- Filter by individual store to see that store's inventory only
- Filter by product category
- Filter by low-stock items (below configurable threshold, default 15% of max stock)
- Toggle between per-store view and aggregated view

**Aggregation:**
- Total stock is the sum of `products.current_stock` across all owned entities
- Low-stock alerts fire per-store, not aggregated — Store A might be low while Store B has plenty

### API Endpoint

```
GET /v1/multi-store/inventory
Authorization: Bearer <jwt>
Query params:
  ?store_id=<uuid>          -- optional, filter to single store
  ?category=<uuid>          -- optional, filter by product category
  ?low_stock_only=true      -- optional, show only low-stock items
Response:
  [
    {
      product_id: UUID,
      product_name: String,
      stores: [
        { entity_id: UUID, entity_name: String, stock: Number },
        ...
      ],
      total_stock: Number,
      low_stock: Boolean
    },
    ...
  ]
```

---

## Stock Transfer Workflow

### Lifecycle

```
INITIATED → IN_TRANSIT → RECEIVED
     │                       ▲
     └──────→ CANCELLED      │
              (before        │
               dispatch)     │
                            │
              Store B confirms receipt
```

### Step-by-Step Flow

**1. Owner initiates transfer (Desktop or PWA)**

Owner selects source store, destination store, and adds products with quantities. The system validates:
- Both stores belong to the owner
- Source store has sufficient stock for all requested items
- No duplicate pending transfers for the same product between the same two stores

On creation:
- `stock_transfers` row inserted with `status = INITIATED`
- `stock_transfer_items` rows inserted with `quantity_requested`
- Source store stock is **reserved** (not yet deducted) — a soft hold prevents double-allocation

**2. Source store dispatches (`INITIATED → IN_TRANSIT`)**

Owner (or store manager at source) confirms dispatch. At this point:
- `status` updated to `IN_TRANSIT`
- `inventory_movements` entry created for each item: `movement_type = TRANSFER_OUT`, `entity_id = from_entity_id`, quantity deducted from source store stock
- WhatsApp notification sent to destination store: "Incoming transfer of X items from [Store A]. Expected arrival: [date]."

**3. Destination store receives (`IN_TRANSIT → RECEIVED`)**

Manager at destination store (or owner) opens the transfer and confirms receipt. For each line item:
- `quantity_received` is recorded (may differ from `quantity_requested` due to damage/shortage)
- `inventory_movements` entry created: `movement_type = TRANSFER_IN`, `entity_id = to_entity_id`, quantity added to destination store stock
- `received_by` and `received_at` are set
- `status` updated to `RECEIVED`

If `quantity_received < quantity_requested` for any item:
- The discrepancy is logged in `audit_logs`
- Owner receives a WhatsApp notification with the variance details
- Source store stock is **not** re-credited — the loss is recorded as-is for reconciliation

**4. Cancellation (`INITIATED → CANCELLED`)**

Only transfers in `INITIATED` status can be cancelled. Once `IN_TRANSIT`, the transfer must be received (with discrepancy notes if needed). Cancellation:
- `status` updated to `CANCELLED`
- Stock reservation at source store released
- No inventory movements created

### Transfer Detail View

Both source and destination store staff see the transfer in their respective dashboards:

| Staff at Source Store | Staff at Destination Store |
|-----------------------|---------------------------|
| See: outgoing transfers | See: incoming transfers |
| Can: mark as dispatched | Can: confirm receipt |
| Cannot: edit quantities | Can: adjust received quantities |
| Cannot: cancel (owner only) | Cannot: cancel (owner only) |

### API Endpoints

```
POST   /v1/multi-store/transfers              — Create transfer
GET    /v1/multi-store/transfers               — List transfers (filterable by status, store)
GET    /v1/multi-store/transfers/:id           — Transfer detail with line items
PATCH  /v1/multi-store/transfers/:id/dispatch   — Mark IN_TRANSIT (source confirms dispatch)
PATCH  /v1/multi-store/transfers/:id/receive    — Mark RECEIVED with quantity_received per item
PATCH  /v1/multi-store/transfers/:id/cancel     — Cancel (INITIATED only)
```

---

## Aggregated Reporting

### Combined P&L

Owner sees a single Profit & Loss statement across all stores:

- **Revenue**: Sum of `grand_total` across all owned entities for the selected period
- **GST Collected**: Sum of `gst_total` across all owned entities
- **Cost of Goods**: Aggregated from wholesale prices * quantities sold
- **Net Profit**: Revenue minus COGS, per-store and combined

### Per-Store Breakdown

Every aggregated report includes a per-store column breakdown:

| Metric | Store A | Store B | Store C | Combined |
|--------|---------|---------|---------|----------|
| Revenue | Nu 45,000 | Nu 32,000 | Nu 28,000 | Nu 105,000 |
| GST Collected | Nu 2,250 | Nu 1,600 | Nu 1,400 | Nu 5,250 |
| Transactions | 120 | 85 | 95 | 300 |
| Avg. Transaction | Nu 375 | Nu 376 | Nu 295 | Nu 350 |

### GST Filing

Each store files GST independently (each `entity` has its own `tpn_gstin`). The aggregated view is for owner visibility only — the system generates per-store GST reports for filing. The owner dashboard links to individual store GST reports.

### Shift Reports

Shift reports remain per-store. The owner can view any store's shift history but cannot close/open shifts remotely (that remains a local, device-bound action as per shift-management spec).

### API Endpoints

```
GET /v1/multi-store/reports/pnl?from=DATE&to=DATE
GET /v1/multi-store/reports/sales?from=DATE&to=DATE&group_by=store|day|product
GET /v1/multi-store/reports/gst?from=DATE&to=DATE
GET /v1/multi-store/reports/shifts?store_id=UUID&from=DATE&to=DATE
```

---

## Per-Store Settings

Each store (entity) maintains its own independent configuration:

| Setting | Scope | Owner Can Edit | Staff Can Edit |
|---------|-------|---------------|----------------|
| GST filing details (`tpn_gstin`) | Per-store | Yes | No |
| Shift management (open/close times, cash float) | Per-store | View only | Manager+ |
| Staff roster | Per-store | View only | Manager+ |
| Receipt template / WhatsApp delivery | Per-store | Yes | No |
| Product catalog visibility (marketplace) | Per-store | Yes | No |
| Pricing overrides | Per-store | Yes | Manager+ |
| Payment methods accepted | Per-store | Yes | No |

Owners switch between store contexts in the dashboard header. The active store context determines which settings are displayed and editable.

---

## Marketplace — Per-Store Subdomain

### Subdomain Routing

Each store gets its own marketplace subdomain:

```
store1.innovates.bt  →  Entity A's marketplace page
store2.innovates.bt  →  Entity B's marketplace page
```

Routing is handled by the marketplace Next.js app via wildcard subdomain resolution:

```
[slug].innovates.bt  →  lookup entities table WHERE slug = [slug]
                      →  render that store's marketplace page
```

### Product Visibility

The owner controls which products appear on each store's marketplace page:

```sql
CREATE TABLE store_marketplace_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,

  CONSTRAINT uq_store_product UNIQUE (entity_id, product_id)
);
```

When a product is toggled off for a store, it disappears from that store's subdomain marketplace page immediately. The product remains visible on other stores' pages where it is toggled on.

### Marketplace API

```
GET  /v1/multi-store/marketplace/products?store_id=UUID       — List marketplace visibility for a store
POST /v1/multi-store/marketplace/products/toggle               — Toggle product visibility
     Body: { entity_id, product_id, is_visible }
POST /v1/multi-store/marketplace/products/bulk-toggle          — Bulk toggle
     Body: { entity_id, product_ids: UUID[], is_visible }
```

---

## Store Context Switching

### UI Pattern

The owner dashboard includes a store selector in the top navigation bar:

- **"All Stores"**: Aggregated view (default for reports and inventory)
- **"Store A — Thimphu"**: Filtered to Store A only
- **"Store B — Paro"**: Filtered to Store B only

When a specific store is selected:
- All dashboard panels filter to that store's data
- Settings page shows that store's configuration
- POS-like views show that store's products and stock levels

When "All Stores" is selected:
- Inventory shows cross-store comparison table
- Reports show aggregated totals with per-store breakdown columns
- Transfers overview shows all pending/recent transfers

---

## Offline Considerations

Stock transfers require network connectivity — they involve writes to multiple entity records and must be validated server-side. The desktop app handles this as follows:

- **Creating a transfer**: Requires online status. If offline, the action is queued in `sync_queue` but flagged as requiring immediate sync. The UI shows a warning: "Transfer will be processed when connection is restored."
- **Dispatching a transfer**: Can be done offline at the source store. The `TRANSFER_OUT` inventory movement is written to local SQLite and synced when online.
- **Receiving a transfer**: Can be done offline at the destination store. The `TRANSFER_IN` inventory movement is written to local SQLite and synced when online. The transfer status update is queued.
- **Conflict risk**: If both stores process their side of the transfer while offline, the transfer record in Supabase will be updated twice on reconnect. The sync engine's LWW strategy handles the status field; the line-item quantities are additive and do not conflict.

---

## Audit Trail

All multi-store operations are logged in `audit_logs`:

| Operation | Actor | Logged Details |
|-----------|-------|----------------|
| Store added to owner | Owner / SUPER_ADMIN | `owner_stores` INSERT |
| Store removed from owner | SUPER_ADMIN only | `owner_stores` DELETE |
| Transfer created | Owner | All line items, source, destination |
| Transfer dispatched | Owner / source manager | Timestamp, quantities |
| Transfer received | Owner / dest manager | Quantities received, any discrepancies |
| Transfer cancelled | Owner | Reason (if provided) |
| Marketplace product toggled | Owner | Store, product, visibility state |

---

## Implementation Checklist

### Database
- [ ] Create `owner_stores` table with RLS policies
- [ ] Create `stock_transfers` table with RLS policies
- [ ] Create `stock_transfer_items` table with RLS policies
- [ ] Create `store_marketplace_products` table with RLS policies
- [ ] Extend `inventory_movements.movement_type` CHECK to include `TRANSFER_OUT`, `TRANSFER_IN`
- [ ] Update `custom_access_token_hook` to populate `entity_ids` claim for owners
- [ ] Add owner cross-store read policies on `transactions`, `inventory_movements`, `products`
- [ ] Add transfer-specific RLS policies (create, visibility, receive)
- [ ] Seed `owner_stores` for existing single-store owners (backfill: each owner gets one row with `is_primary = TRUE`)

### Owner Dashboard — Desktop
- [ ] Store selector component in top navigation (dropdown with "All Stores" + individual stores)
- [ ] Cross-store inventory view with per-store columns and aggregated totals
- [ ] Inventory filter controls (by store, category, low-stock)
- [ ] Stock transfer creation wizard (select source, destination, add products, quantities)
- [ ] Transfer list view with status filters (INITIATED, IN_TRANSIT, RECEIVED, CANCELLED)
- [ ] Transfer detail view with line items and action buttons (dispatch, receive, cancel)
- [ ] Aggregated P&L report with per-store breakdown columns
- [ ] Aggregated sales report with per-store breakdown
- [ ] Aggregated GST view with links to per-store GST filing reports
- [ ] Per-store shift history viewer (read-only for owner)
- [ ] Per-store settings editor (GST details, receipt template, payment methods)

### Owner Dashboard — PWA
- [ ] Responsive store selector (bottom sheet or hamburger menu on mobile)
- [ ] Mobile-optimized cross-store inventory view (card-based per store, swipe between stores)
- [ ] Mobile transfer creation (simplified flow, barcode scan to add products)
- [ ] Mobile transfer list and detail views
- [ ] Mobile aggregated reports (charts with store comparison)
- [ ] Per-store settings viewer on mobile (limited editing — full settings on desktop)

### Stock Transfer Logic
- [ ] Validation: both stores belong to initiator, sufficient stock, no duplicate pending transfers
- [ ] Stock reservation on transfer creation (soft hold on source store)
- [ ] Dispatch handler: deduct from source, create TRANSFER_OUT movements, update status
- [ ] Receive handler: add to destination, create TRANSFER_IN movements, update status, log discrepancies
- [ ] Cancel handler: release reservation, update status (INITIATED only)
- [ ] WhatsApp notifications: transfer created (to destination), dispatched (to destination), received (to owner on discrepancy)

### Marketplace Integration
- [ ] Wildcard subdomain routing in marketplace Next.js app
- [ ] Entity slug field on `entities` table (unique, URL-safe)
- [ ] Store marketplace page rendering products from `store_marketplace_products`
- [ ] Owner product visibility toggle UI (per-store checkboxes in product catalog)
- [ ] Bulk toggle API for marketplace product visibility
- [ ] Cache invalidation when visibility changes (CDN / Next.js ISR revalidation)

### API
- [ ] `GET /v1/multi-store/inventory` — cross-store inventory with filters
- [ ] `POST /v1/multi-store/transfers` — create transfer
- [ ] `GET /v1/multi-store/transfers` — list with status/store filters
- [ ] `GET /v1/multi-store/transfers/:id` — detail with line items
- [ ] `PATCH /v1/multi-store/transfers/:id/dispatch` — mark IN_TRANSIT
- [ ] `PATCH /v1/multi-store/transfers/:id/receive` — mark RECEIVED
- [ ] `PATCH /v1/multi-store/transfers/:id/cancel` — cancel transfer
- [ ] `GET /v1/multi-store/reports/pnl` — aggregated P&L
- [ ] `GET /v1/multi-store/reports/sales` — aggregated sales
- [ ] `GET /v1/multi-store/reports/gst` — aggregated GST view
- [ ] `GET /v1/multi-store/reports/shifts` — per-store shift history
- [ ] `GET /v1/multi-store/marketplace/products` — marketplace visibility list
- [ ] `POST /v1/multi-store/marketplace/products/toggle` — toggle visibility
- [ ] `POST /v1/multi-store/marketplace/products/bulk-toggle` — bulk toggle

### Sync Engine (Desktop)
- [ ] Extend sync engine to handle `stock_transfers` and `stock_transfer_items` tables
- [ ] Offline transfer dispatch: queue TRANSFER_OUT movement in sync_queue
- [ ] Offline transfer receive: queue TRANSFER_IN movement in sync_queue
- [ ] Conflict resolution for transfer status updates (LWW on status field)

### Testing
- [ ] Unit tests: owner JWT contains all entity_ids from owner_stores
- [ ] Unit tests: staff JWT contains only single entity_id
- [ ] Unit tests: transfer creation validation (insufficient stock, unowned stores)
- [ ] Unit tests: transfer lifecycle (INITIATED → IN_TRANSIT → RECEIVED)
- [ ] Unit tests: transfer cancellation (INITIATED only, rejected after dispatch)
- [ ] Unit tests: discrepancy logging when quantity_received < quantity_requested
- [ ] Integration tests: RLS — owner reads cross-store data, staff reads own store only
- [ ] Integration tests: RLS — staff at Store A cannot see Store B data
- [ ] Integration tests: RLS — staff cannot create transfers between stores they don't belong to
- [ ] Integration tests: full transfer cycle (create → dispatch → receive → verify stock levels)
- [ ] E2E: owner creates transfer on desktop, destination manager receives on PWA
- [ ] E2E: offline dispatch synced correctly when back online

---

## Resolved Decisions

**Q: Should the `owner_stores` junction table reference `auth.users(id)` or `user_profiles(id)`?**
A: **`user_profiles(id)`**. The owner relationship is a business concern tied to the user's role within an entity, not their raw auth identity. Referencing `user_profiles` keeps the relationship consistent with the existing role model and allows the system to distinguish between an owner's access at different role levels if needed.

**Q: Can a store belong to multiple owners (e.g., co-ownership)?**
A: **Not in this phase.** `owner_stores` enforces one owner per entity_id per owner_profile_id. A store's `user_profiles` sub_role = OWNER can have only one row per owner. Co-ownership (two owners for one store) is a future consideration requiring a different permission model. For now, a single owner account manages each store.

**Q: Should stock transfers support partial receives?**
A: **Yes.** `quantity_received` is recorded per line item and can differ from `quantity_requested`. Discrepancies are logged in `audit_logs` and flagged to the owner. This covers real-world scenarios like breakage in transit or miscounts at the source.

**Q: What happens if a transfer is IN_TRANSIT and the source store goes offline permanently?**
A: **The owner can still mark the transfer as RECEIVED at the destination.** The transfer lifecycle does not require the source store to be online for receipt confirmation. The IN_TRANSIT status already confirms the stock left the source. The destination store independently confirms what arrived.

**Q: Should the marketplace subdomain use the entity name or a custom slug?**
A: **Custom slug.** A `slug` column is added to `entities` (unique, URL-safe, owner-editable). Default slugs are auto-generated from the entity name but owners can customize them. This avoids special characters and allows branding flexibility (e.g., `tsongkha.innovates.bt` instead of `tsongkha-general-store.innovates.bt`).

**Q: Can staff see transfers?**
A: **Yes, but scoped.** Staff at the source store see outgoing transfers involving their store. Staff at the destination store see incoming transfers. They cannot see transfers between two other stores they are not part of. The `transfer_visibility` RLS policy enforces this.
