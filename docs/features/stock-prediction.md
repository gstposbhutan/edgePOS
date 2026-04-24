# Feature: Stock-Out Prediction & Alerts

**Feature ID**: F-PREDICT-001
**Phase**: 5
**Status**: Scoped
**Last Updated**: 2026-04-19
**Dependencies**: `inventory_movements` table (existing), `products.current_stock` (existing)

---

## Overview

Automated stock-out prediction that calculates how many days remain before each product runs out, flags at-risk and critical items, and notifies the store owner before it happens. The system uses historical sales velocity (Average Daily Sales) combined with supplier lead times to produce reorder suggestions with a built-in safety buffer.

The prediction engine runs as a daily batch job. Desktop shows a full prediction dashboard; the PWA surfaces alert banners and push notifications; WhatsApp delivers a concise stock alert summary to the owner's phone.

---

## Calculations

### Average Daily Sales (ADS)

For each product, over the trailing 30 days:

```
ADS = total units sold / 30
```

Source: `inventory_movements` rows where `movement_type = 'SALE'`, summed by `product_id` for the last 30 calendar days.

### Weighted ADS (Seasonal Adjustment)

To account for recent demand spikes or dips, a weighted average gives more weight to recent sales:

```
weighted_ADS = (units_sold_last_7_days * 3 + units_sold_previous_23_days * 1) / (7 * 3 + 23 * 1)
             = (units_sold_last_7_days * 3 + units_sold_previous_23_days) / 44
```

The system uses `weighted_ADS` as the primary velocity metric. Plain ADS is stored for reference.

### Days Until Stockout

```
days_until_stockout = current_stock / weighted_ADS
```

Source for stock: `products.current_stock`.

### Reorder Suggestion

```
suggested_reorder_qty = weighted_ADS * lead_time_days * 1.5
```

- `lead_time_days` comes from `supplier_lead_times` for the product. If no lead time is set, defaults to 7 days.
- The `1.5` multiplier is a fixed safety buffer to absorb variance.

### Status Thresholds

| Condition | Status | Row Color |
|-----------|--------|-----------|
| `days_until_stockout >= threshold` | Healthy | Default |
| `days_until_stockout < threshold` (default 7) | At Risk | Amber / Gold |
| `days_until_stockout < 3` | Critical | Red / Tibetan |

If the product has a `products.reorder_point` set, that value overrides the default 7-day threshold for the At Risk check. The Critical threshold (3 days) is always absolute.

---

## Edge Cases

| Case | Handling |
|------|----------|
| New product with < 7 days of sales data | Exclude from prediction entirely. Status: `INSUFFICIENT_DATA`. These products appear in the dashboard but are clearly marked and greyed out. |
| Product with 0 sales in last 30 days | Exclude from prediction. Status: `DEAD_STOCK`. Not predictive — the product is not moving. Appears in dashboard for awareness but generates no alerts. |
| `current_stock = 0` | Days until stockout = 0. Status: `CRITICAL`. Immediate reorder suggested. |
| `weighted_ADS = 0` but product has >= 7 days of data | Treated as dead stock. No reorder suggestion generated. |
| `current_stock` is negative (data corruption) | Flag as `ERROR` in dashboard. Do not send alerts. Log for manual review. |
| Multiple supplier lead times for one product | Use the shortest lead time (most optimistic restock path). |

---

## Data Model

### `stock_predictions` (table or materialized view, refreshed daily)

Stores the output of the daily prediction run. Queried by both desktop dashboard and PWA alerts.

```sql
CREATE TABLE stock_predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  avg_daily_sales       DECIMAL(10,2) NOT NULL,       -- plain 30-day ADS
  weighted_ads          DECIMAL(10,2) NOT NULL,       -- seasonally weighted ADS
  days_until_stockout   DECIMAL(10,2),                -- NULL for excluded products
  suggested_reorder_qty DECIMAL(10,2),                -- NULL for excluded products
  status                TEXT NOT NULL CHECK (status IN (
                          'HEALTHY', 'AT_RISK', 'CRITICAL',
                          'INSUFFICIENT_DATA', 'DEAD_STOCK', 'ERROR'
                        )),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(product_id, entity_id, calculated_at)
);

CREATE INDEX idx_stock_predictions_status ON stock_predictions(entity_id, status);
CREATE INDEX idx_stock_predictions_days ON stock_predictions(entity_id, days_until_stockout);
```

### `supplier_lead_times`

Per-product (or per-category) lead time configuration. Maintained by the store owner or auto-populated from wholesale order history.

```sql
CREATE TABLE supplier_lead_times (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID REFERENCES products(id),
  category_id           UUID,                         -- fallback if no product-level entry
  supplier_id           UUID REFERENCES entities(id), -- the wholesaler/distributor
  lead_time_days        INT NOT NULL DEFAULT 7 CHECK (lead_time_days > 0),
  updated_by            UUID REFERENCES user_profiles(id),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  notes                 TEXT                          -- e.g. "Sundays off, add 1 day"
);

-- Prefer product-level over category-level lookups
CREATE INDEX idx_slt_product ON supplier_lead_times(product_id);
CREATE INDEX idx_slt_category ON supplier_lead_times(category_id);
```

Lead time lookup order:
1. Exact `product_id` match
2. `category_id` match (product's category)
3. Default: 7 days

---

## Daily Batch Job

### Mechanism

A Supabase Edge Function (Deno) triggered by `pg_cron` every day at 06:00 local time (Bhutan BST, UTC+6).

```
pg_cron schedule: 0 0 * * *  (00:00 UTC = 06:00 BST)
```

### Steps

1. **Gather sales data**: Query `inventory_movements` for each `(product_id, entity_id)` pair over the last 30 days. Split into two buckets: last 7 days and previous 23 days.
2. **Calculate ADS and weighted ADS**: Apply the formulas above.
3. **Apply exclusion rules**: Skip products with < 7 days of data or 0 total sales.
4. **Calculate days until stockout and reorder qty**: Using `products.current_stock` and resolved lead time.
5. **Determine status**: Apply threshold logic (At Risk < 7 days, Critical < 3 days, or use `products.reorder_point`).
6. **Write to `stock_predictions`**: Upsert one row per `(product_id, entity_id)`.
7. **Trigger notifications**: If any AT_RISK or CRITICAL items exist for an entity, queue WhatsApp alert and set in-app banner flag.

---

## Platform Surfaces

### Desktop — Prediction Dashboard (Admin Hub)

Full table view within the inventory section of the Admin Hub.

**Table columns** (sorted by `days_until_stockout` ascending):

| Column | Source |
|--------|--------|
| Product Name | `products.name` |
| Current Stock | `products.current_stock` |
| Weighted ADS | `stock_predictions.weighted_ads` |
| Days Until Stockout | `stock_predictions.days_until_stockout` |
| Suggested Reorder Qty | `stock_predictions.suggested_reorder_qty` |
| Status | `stock_predictions.status` |

**Row coloring**:
- Healthy: default row style
- At Risk: amber/gold left border or background tint
- Critical: red/tibetan left border or background tint, bold text
- Insufficient Data / Dead Stock: grey text, reduced opacity

**Additional dashboard elements**:
- Summary cards at top: "X Critical", "Y At Risk", "Z Healthy"
- "Generate Reorder List" button that exports AT_RISK + CRITICAL items as a WhatsApp-ready message or PDF
- Filter by status and search by product name
- Last calculated timestamp shown in header

### PWA — Alert Banners

When `stock_predictions` contains any CRITICAL items for the current entity:

1. **Persistent top banner** on all PWA screens: "X products critically low. Tap to view." Tapping opens a condensed alert list.
2. **Condensed alert list** (slide-up sheet): Product name, days left, suggested reorder. Single "Reorder" button per item that navigates to the wholesale order flow.

When AT_RISK items exist (but no CRITICAL):

1. **Subtle notification dot** on the inventory tab icon.
2. Opening inventory shows the at-risk items highlighted at the top.

### WhatsApp — Owner Notification

Sent once per daily run (not per item). Batched into a single message.

**Template**:

```
Stock Alert: {count} products running low.

{product_name} — {days} days left ({stock} units, ~{ads}/day)
{product_name} — {days} days left ({stock} units, ~{ads}/day)

Reply RESTOCK to generate reorder list.
```

Only AT_RISK and CRITICAL items are included. Items sorted by days remaining (lowest first). Maximum 10 items per message; if more exist, append "…and X more. Open dashboard for full list."

The "Reply RESTOCK" flow triggers a follow-up message with pre-formatted reorder quantities that the owner can forward to their wholesaler via WhatsApp.

---

## Integration Points

### Existing Tables Used

| Table | Fields Used | Purpose |
|-------|-------------|---------|
| `inventory_movements` | `product_id`, `entity_id`, `movement_type='SALE'`, `quantity`, `timestamp` | Calculate ADS from last 30 days of sales |
| `products` | `id`, `name`, `current_stock`, `reorder_point`, `category_id` | Stock levels, display names, override thresholds |
| `entities` | `id`, `whatsapp_no` | Owner identification for WhatsApp alerts |

### New Tables (defined above)

- `stock_predictions` — daily snapshot of predictions
- `supplier_lead_times` — configurable lead times

### Downstream Consumers

- **Reorder flow** (Phase 5+): Suggested reorder qty feeds directly into the wholesale order creation screen
- **GST reporting**: No direct link, but accurate stock levels improve inventory reconciliation
- **Dashboard analytics**: ADS data can power sales velocity charts in future analytics modules

---

## API Endpoints

### `GET /v1/predictions/:entity_id`

Returns current stock predictions for an entity.

**Response**:
```json
{
  "calculated_at": "2026-04-19T06:00:00Z",
  "summary": { "critical": 2, "at_risk": 5, "healthy": 120, "insufficient_data": 8, "dead_stock": 3 },
  "predictions": [
    {
      "product_id": "uuid",
      "product_name": "Druk 110g Noodles",
      "current_stock": 12,
      "weighted_ads": 4.2,
      "days_until_stockout": 2.9,
      "suggested_reorder_qty": 44,
      "status": "CRITICAL"
    }
  ]
}
```

**Query params**: `?status=CRITICAL,AT_RISK` to filter. Default returns all. `?sort=days_asc` (default) or `?sort=name_asc`.

### `POST /v1/predictions/:entity_id/refresh`

Manually trigger a prediction recalculation outside the daily schedule. Rate-limited to 1 request per 5 minutes per entity.

### `GET /v1/lead-times/:entity_id`

Returns configured supplier lead times for an entity's products.

### `PUT /v1/lead-times/:product_id`

Create or update lead time for a specific product. Body: `{ "supplier_id": "uuid", "lead_time_days": 5, "notes": "..." }`.

---

## Notification Flow

```
pg_cron (06:00 BST)
    |
    v
Edge Function: calculate_predictions()
    |
    +--> Write to stock_predictions
    |
    +--> Check for AT_RISK / CRITICAL items
          |
          +--> YES: Queue WhatsApp message (whatsapp-gateway service)
          |          Set in-app alert flag (Supabase Realtime broadcast)
          |
          +--> NO:  Clear previous alert flag. No WhatsApp sent.
```

### Supabase Realtime Channel

The PWA subscribes to a Realtime channel `stock-alerts:{entity_id}`. When the daily job writes predictions, it also broadcasts a payload:

```json
{
  "event": "predictions_updated",
  "critical_count": 2,
  "at_risk_count": 5
}
```

The PWA uses this to toggle the alert banner without polling.

---

## Configuration

| Setting | Default | Storage | Notes |
|---------|---------|---------|-------|
| Default threshold (days) | 7 | Per-entity or app config | Overridden by `products.reorder_point` |
| Critical threshold (days) | 3 | Hard-coded | Can be made configurable in future |
| Safety buffer multiplier | 1.5 | Hard-coded | Applied to reorder suggestion |
| Default lead time (days) | 7 | App config | Used when no `supplier_lead_times` row exists |
| Min sales history (days) | 7 | Hard-coded | Products with fewer days are excluded |
| Lookback window (days) | 30 | Hard-coded | ADS calculation period |
| Recent weight multiplier | 3 | Hard-coded | Weight of last 7 days vs. older 23 days |
| Max WhatsApp items | 10 | App config | Truncate long alert lists |

---

## Implementation Checklist

- [ ] Create `stock_predictions` table with indexes
- [ ] Create `supplier_lead_times` table with indexes
- [ ] Write Supabase Edge Function `calculate-predictions` (Deno)
- [ ] Set up `pg_cron` schedule for daily run at 06:00 BST
- [ ] Build ADS calculation logic with weighted average
- [ ] Implement edge-case filtering (< 7 days data, 0 sales, negative stock)
- [ ] Implement threshold logic with `products.reorder_point` override
- [ ] Build reorder suggestion calculation with lead time lookup
- [ ] Add `GET /v1/predictions/:entity_id` API endpoint
- [ ] Add `POST /v1/predictions/:entity_id/refresh` manual trigger endpoint
- [ ] Add `GET /v1/lead-times/:entity_id` and `PUT /v1/lead-times/:product_id` endpoints
- [ ] Build Desktop prediction dashboard table with color-coded rows
- [ ] Build Desktop summary cards (Critical / At Risk / Healthy counts)
- [ ] Build Desktop "Generate Reorder List" export (WhatsApp message + PDF)
- [ ] Build PWA critical alert banner (persistent top bar)
- [ ] Build PWA condensed alert list (slide-up sheet with reorder buttons)
- [ ] Build PWA at-risk notification dot on inventory tab
- [ ] Implement Supabase Realtime broadcast on prediction write
- [ ] Integrate WhatsApp gateway for daily stock alert message
- [ ] Implement "RESTOCK" reply flow for reorder list via WhatsApp
- [ ] Add rate limiting on manual refresh endpoint (1 per 5 min)
- [ ] Write unit tests for ADS calculation (edge cases: zero sales, single day, spikes)
- [ ] Write unit tests for threshold logic (reorder_point override, boundary values)
- [ ] Write integration test for full batch pipeline (seed data, run, verify predictions)
- [ ] Add RLS policies on `stock_predictions` (entity-level isolation)
- [ ] Add RLS policies on `supplier_lead_times` (entity-level isolation)

---

## Resolved Decisions

| # | Decision |
|---|----------|
| 1 | Use **weighted ADS** (recent 7 days weighted 3x) as the primary velocity metric instead of plain 30-day average. This captures recent demand shifts without being overly reactive. |
| 2 | **Exclude** products with < 7 days of sales data rather than making unreliable predictions. Status shown as `INSUFFICIENT_DATA` for transparency. |
| 3 | **Exclude** products with 0 sales in 30 days (dead stock). These are not predictive — generating reorder suggestions for unmoving products wastes owner attention. |
| 4 | Store predictions in a **table** (not materialized view) so we can query by status and support manual refresh without full recalculation. Daily rows are appended with `calculated_at` for historical tracking. |
| 5 | Lead time is **per product per supplier**. Fallback chain: product-level, then category-level, then default 7 days. |
| 6 | Safety buffer is **1.5x** (fixed). Provides 50% extra stock to absorb demand variance and delivery delays. Not configurable per entity to keep initial implementation simple. |
| 7 | WhatsApp alerts are **batched into one daily message** (not per-item) to avoid spamming the owner. Maximum 10 items listed; overflow noted with count. |
| 8 | `products.reorder_point` (if set) **overrides** the default 7-day AT_RISK threshold. This lets owners configure per-product sensitivity without touching the prediction engine. |
| 9 | Critical threshold (3 days) is **absolute** and cannot be overridden by `reorder_point`. This ensures truly urgent stockouts are always flagged. |
| 10 | PWA uses **Supabase Realtime** channel to receive alert state changes, not polling. Reduces battery and data usage on mobile devices. |
