# Feature: Offline Sync Engine (SQLite ↔ Supabase)

**Feature ID**: F-SYNC-001
**Phase**: 4 (core SQLite layer built in Phase 1)
**Status**: Scoped
**Last Updated**: 2026-04-19
**Dependencies**: F-DESKTOP-001

---

## Overview

The desktop Electron app uses local SQLite (better-sqlite3) as its primary database for instant reads/writes with zero network dependency. The mobile PWA reads and writes Supabase directly. The sync engine bridges these two worlds — pushing local desktop changes up to Supabase and pulling remote changes down to SQLite — so both surfaces share a consistent view of business data.

The PWA does **not** need a sync engine of its own. It reads and writes Supabase directly and sees desktop transactions as they appear in Supabase.

---

## Architecture

```
┌──────────────────────────────────┐       ┌─────────────────────┐
│       ELECTRON DESKTOP APP       │       │    MOBILE PWA       │
│                                  │       │                     │
│  ┌───────────┐   ┌────────────┐  │       │  Supabase Client    │
│  │  UI Layer │◄──│  SQLite    │  │       │  (direct R/W)       │
│  │  (React)  │   │  (local)   │  │       │                     │
│  └───────────┘   └─────┬──────┘  │       └────────┬────────────┘
│                        │         │                │
│                  ┌─────▼──────┐  │                │
│                  │  SYNC      │  │                │
│                  │  ENGINE    │  │                │
│                  └─────┬──────┘  │                │
│                        │         │                │
└────────────────────────┼─────────┘                │
                         │                          │
                    ┌────▼──────────────────────────▼────┐
                    │           SUPABASE (Cloud)          │
                    │    Postgres + Realtime + RLS        │
                    └────────────────────────────────────┘
```

---

## Sync Directions

### Direction 1: SQLite → Supabase (Push)

Local-first data created on the desktop app is pushed to Supabase when online.

| Entity | Trigger | Notes |
|--------|---------|-------|
| Transactions | On `CONFIRMED` status | Full transaction record including items JSONB, GST breakdown, payment method |
| Inventory movements | On each movement event | SALE, RESTOCK, TRANSFER, LOSS, DAMAGED — appends to `inventory_movements` |
| New products | On product creation | Products created locally (e.g. via camera scan) are pushed to Central Brain |
| Credit ledger entries | On debit/credit event | Credit transactions, repayments — financial data pushed immediately when online |
| Shift records | On shift open/close | Cashier shift open time, close time, opening/closing cash counts |
| Audit logs | On each auditable action | All INSERT/UPDATE/DELETE operations logged for compliance |

### Direction 2: Supabase → SQLite (Pull)

Remote data managed centrally or from other surfaces is pulled down to the desktop's SQLite.

| Entity | Source | Notes |
|--------|--------|-------|
| Product updates | Central Brain / Admin Hub | Name changes, new images, re-categorized HSN codes |
| Pricing changes | Admin Hub (Wholesaler) | Updated wholesale prices, MRP revisions |
| Category additions | Admin Hub / Distributor | New product categories and sub-categories |
| User profiles | Admin Hub | New staff accounts, role/permission changes |
| Marketplace orders | Consumer portal | Orders placed by consumers for fulfilment at this store |
| Credit limit adjustments | Admin Hub (Wholesaler/Distributor) | Credit limit changes, freeze/unfreeze status |

---

## Sync Triggers

The sync engine operates on three triggers, evaluated in priority order:

### (a) Real-time Push (immediate)
After any local write operation that adds an entry to `sync_queue`, the engine checks network status. If online, the entry is pushed to Supabase immediately — no delay. This ensures near-instant visibility of desktop transactions on the PWA and Admin Hub.

```
Local write completes
  → sync_queue entry created (status = PENDING)
  → Network check: navigator.onLine || last health ping
  → If ONLINE: push immediately
  → If OFFLINE: entry remains PENDING, handled by periodic check
```

### (b) Periodic Sweep (every 60 seconds)
A background interval scans `sync_queue` for any `PENDING` entries regardless of the real-time trigger. This is a safety net that catches:
- Entries that failed during real-time push (network blip mid-request)
- Entries accumulated while offline that were not flushed on reconnect
- Any edge case where the real-time trigger did not fire

```
Every 60 seconds:
  → SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC
  → If results: push batch to Supabase
  → On success: mark COMPLETED
  → On failure: leave PENDING, increment retry_count
```

### (c) On Reconnect (network status change)
When the browser/Electron runtime detects a transition from offline to online (`window.addEventListener('online', ...)`), the engine flushes the entire pending queue in FIFO order.

```
Offline → Online transition detected
  → Flush all PENDING entries from sync_queue
  → Push in FIFO order (oldest first)
  → Mark each COMPLETED on success
  → Update system tray indicator: spinning → green check
```

---

## Queue System

### `sync_queue` Table (SQLite)

Every local write operation inserts a corresponding entry here. This is the single source of truth for what needs to reach Supabase.

```sql
CREATE TABLE sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,                -- e.g. 'transactions', 'inventory_movements'
  record_id       TEXT NOT NULL,                -- UUID of the affected row
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  payload         TEXT NOT NULL,                -- JSON string of the full row data
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'COMPLETED', 'CONFLICT', 'FAILED')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 10,
  last_error      TEXT,                         -- Error message from last failed attempt
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at       TEXT                          -- Timestamp of successful sync
);

CREATE INDEX idx_sync_queue_status ON sync_queue(status, created_at);
```

### Queue Lifecycle

```
INSERT/UPDATE/DELETE on local table
  → AFTER trigger inserts row into sync_queue (status = PENDING)
  → Sync engine picks up entry on next trigger
  → Push to Supabase via REST/GraphQL
  → Success: status = COMPLETED, synced_at = now()
  → Failure (transient): retry_count++, stay PENDING
  → Failure (after max_retries): status = FAILED, last_error populated
  → Conflict detected: status = CONFLICT, alert owner
```

### FIFO Ordering

`sync_queue` is always processed ordered by `created_at ASC`. This guarantees:
- A product INSERT is pushed before its dependent transaction INSERT
- Inventory movements follow the chronological order they occurred
- Financial records maintain their audit trail sequence

### Queue Cleanup

Completed entries are retained for 7 days (configurable) for debugging and reconciliation, then purged by a daily cleanup job.

---

## Conflict Resolution

### Strategy by Data Type

| Data Type | Resolution Strategy | Rationale |
|-----------|-------------------|-----------|
| Product names, descriptions, categories | **LWW** (Last Write Wins) | Metadata conflicts are low-risk; latest edit is most likely correct |
| Prices (wholesale, MRP) | **LWW** (Last Write Wins) | Price changes are authoritative from Admin Hub; local stale price is overwritten |
| Transaction totals, payment refs | **Manual Flag** | Financial data must never be silently overwritten |
| Credit balances | **Manual Flag** | Money amounts require human verification |
| Inventory stock counts | **LWW with reconciliation** | Accept latest count, flag for owner review if delta > threshold |

### LWW Implementation

Each synced table has a `updated_at TIMESTAMPTZ` column. On conflict:
1. Compare `updated_at` of local record vs Supabase record
2. Later timestamp wins
3. Write winning version to both sides
4. Log outcome in `sync_conflicts` table (resolution = 'LWW')

### Manual Flag Implementation

For financial data:
1. Sync engine detects conflict (record exists in Supabase with different values)
2. Local entry in `sync_queue` set to `status = CONFLICT`
3. Both versions preserved — local version and Supabase version stored in `sync_conflicts`
4. System tray shows red indicator with count
5. Owner opens conflict resolution UI: sees both versions side-by-side
6. Owner picks correct version (or manually merges)
7. Resolution written to both SQLite and Supabase
8. `sync_queue` entry marked COMPLETED

### `sync_conflicts` Table (SQLite)

```sql
CREATE TABLE sync_conflicts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_queue_id   INTEGER NOT NULL REFERENCES sync_queue(id),
  table_name      TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  local_version   TEXT NOT NULL,                -- JSON snapshot of local data
  remote_version  TEXT NOT NULL,                -- JSON snapshot of Supabase data
  resolution      TEXT CHECK (resolution IN ('LOCAL', 'REMOTE', 'MERGED')),
  resolved_by     TEXT,                         -- User ID who resolved
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## System Tray Indicator

The Electron app exposes a system tray icon that reflects sync health at a glance.

| State | Icon | Meaning |
|-------|------|---------|
| Synced | Green checkmark | Queue is empty. All data in Supabase. |
| Syncing | Spinning arrow | Currently pushing or pulling data. |
| Pending | Red dot with badge count (e.g. "3") | N items in queue awaiting sync. |
| Conflict | Yellow warning triangle | At least one conflict requires manual resolution. |
| Offline | Grey circle with slash | No network. Queue is accumulating. |

### Behavior

- Hover tooltip shows: "Synced — all data up to date" or "3 items pending sync" or "1 conflict needs attention"
- Clicking the tray icon opens the sync status panel within the Electron app
- The status panel shows: queue depth, last successful sync time, any failed items with error messages, conflict resolution UI

---

## Pull Strategy (Supabase → SQLite)

The sync engine also pulls remote changes into SQLite so the desktop app has current data.

### Change Detection

Supabase tables tracked for pull have a `updated_at` column. The engine maintains a watermark:

```sql
CREATE TABLE sync_watermarks (
  table_name    TEXT PRIMARY KEY,
  last_pulled_at TEXT NOT NULL  -- ISO 8601 timestamp of last successful pull
);
```

On each pull cycle (runs alongside the periodic sweep):
1. Read `last_pulled_at` for each tracked table
2. Query Supabase: `SELECT * FROM {table} WHERE updated_at > '{last_pulled_at}'`
3. Upsert results into local SQLite
4. Update `last_pulled_at` to `MAX(updated_at)` from the result set

### Supabase Realtime (Optional Enhancement)

For tables that change frequently (marketplace orders, credit limit adjustments), subscribe to Supabase Realtime channels. Changes arrive as WebSocket events and are applied to SQLite immediately, bypassing the polling interval.

```
Supabase Realtime event received
  → Parse payload
  → Upsert into local SQLite table
  → UI reflects change immediately (no refresh needed)
```

This is an enhancement — the periodic pull serves as the reliable fallback if Realtime disconnects.

---

## Error Handling

### Transient Failures
- Network timeout, 5xx server errors, rate limiting
- Strategy: retry with exponential backoff (1s, 2s, 4s, 8s, ... up to 60s)
- After `max_retries` (default 10), mark as FAILED

### Permanent Failures
- 4xx errors (validation failure, RLS policy violation, schema mismatch)
- Strategy: mark as FAILED immediately, log `last_error`, alert owner
- Do not retry — requires code fix or manual data correction

### Data Integrity
- Each queue entry is pushed as a single Supabase transaction
- If any part fails, the entire entry is rolled back on Supabase side
- Local SQLite data is never rolled back — it remains the source of truth locally
- Queue entry stays PENDING for retry

---

## Database Schema — SQLite Tables (Desktop)

The desktop Electron app mirrors relevant Supabase tables locally. Key tables:

```sql
-- Products (pulled from Supabase)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hsn_code TEXT,
  category_id TEXT,
  image_url TEXT,
  wholesale_price REAL,
  mrp REAL,
  current_stock INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Transactions (created locally, pushed to Supabase)
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  inv_no TEXT UNIQUE NOT NULL,
  seller_id TEXT NOT NULL,
  items TEXT NOT NULL,           -- JSON array
  subtotal REAL NOT NULL,
  gst_total REAL NOT NULL,
  grand_total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Inventory Movements (created locally, pushed to Supabase)
CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL
);
```

Each of these tables has an `AFTER INSERT OR UPDATE` trigger that inserts into `sync_queue`.

---

## PWA Considerations

The mobile PWA does **not** run a sync engine. Its data access pattern is:

- **Read**: Direct Supabase query (products, orders, reports)
- **Write**: Direct Supabase insert/update (orders, profile changes)
- **Offline**: PWA shows a connectivity gate (consistent with F-AUTH-001 offline handling). No local writes are attempted while offline.

This means the sync engine is exclusively an Electron desktop concern. The PWA sees desktop transactions as soon as they land in Supabase — no additional coordination needed.

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Real-time push latency (local write → Supabase confirmed) | < 2 seconds on stable connection |
| Periodic sweep duration (50 pending entries) | < 5 seconds |
| Full queue flush on reconnect (100 entries) | < 10 seconds |
| Pull cycle (all tracked tables) | < 3 seconds |
| SQLite query impact on UI thread | Zero — all sync on dedicated worker thread |
| Queue entry size (average) | < 5 KB per entry |

---

## Implementation Checklist

### Phase 1 — SQLite Foundation (build alongside F-DESKTOP-001)
- [ ] Set up better-sqlite3 in Electron main process
- [ ] Create local schema: products, transactions, inventory_movements, shift_records, audit_logs
- [ ] Create `sync_queue` table with indexes
- [ ] Create `sync_watermarks` table
- [ ] Create `sync_conflicts` table
- [ ] Implement AFTER INSERT/UPDATE triggers on all synced tables to populate sync_queue
- [ ] Build SQLite access layer (read/write API for renderer process via IPC)

### Phase 4 — Sync Engine
- [ ] Implement sync engine class: init, push, pull, flush
- [ ] Real-time push: listen for sync_queue inserts, push immediately when online
- [ ] Periodic sweep: 60-second interval scanning for PENDING entries
- [ ] Reconnect flush: listen for `online` event, flush entire queue
- [ ] FIFO ordering enforced on all push operations
- [ ] Exponential backoff retry for transient failures (1s → 60s ceiling)
- [ ] Max retry enforcement (default 10), mark FAILED after exhaustion
- [ ] Implement LWW conflict resolution for metadata tables
- [ ] Implement manual flag conflict detection for financial tables
- [ ] Build conflict resolution UI (side-by-side local vs remote, pick/merge)
- [ ] Pull engine: watermark-based incremental pull from Supabase
- [ ] Upsert logic for pulled records into SQLite
- [ ] Optional: Supabase Realtime subscriptions for high-frequency tables

### System Tray
- [ ] Green check icon when queue is empty
- [ ] Spinning arrow icon during active sync
- [ ] Red dot icon with pending count badge
- [ ] Yellow warning icon for unresolved conflicts
- [ ] Grey offline icon when no network
- [ ] Hover tooltip with sync status summary
- [ ] Click handler opens sync status panel in app

### Sync Status Panel
- [ ] Queue depth display (pending, failed, conflict counts)
- [ ] Last successful sync timestamp
- [ ] Failed entries list with error messages and retry button
- [ ] Conflict entries list with resolution UI link
- [ ] Manual "Force Sync" button
- [ ] Manual "Pull Latest" button

### Completed Entry Cleanup
- [ ] Daily cleanup job: purge sync_queue entries older than 7 days with status = COMPLETED
- [ ] Purge sync_conflicts entries older than 30 days that are resolved

### Testing
- [ ] Unit tests: sync_queue trigger fires on every local write
- [ ] Unit tests: FIFO ordering maintained under concurrent writes
- [ ] Unit tests: LWW resolution picks correct winner
- [ ] Integration tests: full push cycle (SQLite → Supabase → verify row exists)
- [ ] Integration tests: full pull cycle (Supabase → SQLite → verify row exists)
- [ ] Integration tests: reconnect flush processes entire queue
- [ ] Integration tests: conflict detection and manual flag flow
- [ ] E2E test: desktop transaction visible on PWA within 5 seconds
- [ ] E2E test: product price change on Admin Hub visible on desktop within 60 seconds

---

## Resolved Decisions

**Q: Why SQLite instead of IndexedDB or PouchDB?**
A: better-sqlite3 offers synchronous, transactional, high-performance queries on Electron — ideal for a POS terminal that cannot tolerate write latency. IndexedDB is async and browser-scoped. PouchDB adds a dependency layer without solving anything SQLite does not already handle. SQLite is the standard local database for Electron desktop apps.

**Q: Why not use Supabase Realtime exclusively for both directions?**
A: Realtime is a WebSocket channel — it can drop, disconnect, or deliver out of order. The queue-based approach guarantees delivery (entries persist until confirmed). Realtime is used as an optional enhancement for pull only, with the watermark-based polling as the reliable fallback.

**Q: Why does the PWA not have a sync engine?**
A: The PWA is a cloud-first surface. It reads and writes Supabase directly. Adding a local sync layer to the PWA would duplicate complexity for no gain — the PWA is already online-dependent by design (consistent with F-AUTH-001 offline hard-block). Only the desktop app needs offline capability and therefore a sync bridge.

**Q: Why LWW for prices? Shouldn't price changes require manual confirmation?**
A: Price authority sits with the Admin Hub (Wholesaler/Distributor). The desktop POS is a consumer of price data, not a producer. Overwriting a stale local price with the latest Admin Hub price is the correct behavior — the local price was already superseded. If the owner disagrees with a price change, that is an Admin Hub workflow, not a sync conflict.

**Q: What happens if the desktop is offline for days?**
A: The queue accumulates. There is no hard limit on queue size — storage is bounded by disk space. On reconnect, the entire queue flushes in FIFO order. Very large queues (1000+ entries) may take several minutes to flush; the system tray indicator shows progress. Transactions are timestamped with their original creation time, not their sync time, so GST reporting remains accurate.

**Q: What if two desktop POS terminals are running for the same store?**
A: This spec covers single-terminal sync. Multi-terminal scenarios (same entity, multiple Electron instances) are out of scope for F-SYNC-001 and would require Supabase Realtime-based coordination between terminals. This is a future consideration, not a current requirement.
