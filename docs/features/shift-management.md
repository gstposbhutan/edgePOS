# Feature: Shift Management & Blind Cash Close

**Feature ID**: F-SHIFT-001
**Phase**: 5
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Desktop-only feature that enforces honest cash handling through blind close reconciliation. Each cashier shift is an independent, tamper-evident session. The system silently tracks all transaction activity but deliberately withholds running totals from the cashier until the physical count is submitted. Discrepancies are surfaced only to MANAGER and OWNER roles, keeping the cashier blind to expectations and accountable to the count.

---

## Platform Scope

**Desktop only.** This feature does not appear on tablet or mobile POS layouts. Shift management controls are located in the desktop sidebar under a dedicated "Shifts" panel visible to CASHIER, MANAGER, and OWNER roles (with role-filtered content).

---

## Shift Lifecycle

```
OPEN ──→ ACTIVE ──→ CLOSING ──→ CLOSED
```

| State | Trigger | Description |
|-------|---------|-------------|
| **OPEN** | CASHIER or MANAGER clicks "Start Shift" | System prompts for opening cash float. Records `opened_at`, `opened_by`, `opening_float`. |
| **ACTIVE** | Float confirmed | System silently tracks all transactions. Cashier sees only current cart and per-transaction receipts. No running totals visible. |
| **CLOSING** | CASHIER clicks "End Shift" | System prompts: "Count cash in drawer." Cashier enters physical count. Expected total is NOT shown. |
| **CLOSED** | Physical count submitted | System calculates expected vs. actual. Discrepancy logged. WhatsApp alert sent to owner. Cashier sees "Shift closed. Report sent to owner." |

---

## Open Shift

1. CASHIER or MANAGER logs into POS terminal
2. Clicks "Start Shift" button in sidebar Shifts panel
3. Modal appears: "Enter cash float in drawer"
4. Cashier counts physical cash and enters the amount
5. System records:
   - `opened_at` — timestamp
   - `opened_by` — user ID of the cashier
   - `opening_float` — declared amount
6. POS becomes transaction-ready

### Drawer Handoff (Multi-Shift Stores)

When one cashier's shift ends and another begins without a full drawer reset:

1. Closing cashier performs standard blind close (counts drawer)
2. Opening cashier is prompted: "Previous shift closed with Nu. X in drawer. Confirm starting float?"
3. Opening cashier can adjust the float amount if they count differently
4. Any difference between closing count and confirmed opening float is logged as a handoff discrepancy
5. Both cashiers' records are linked for audit trail

---

## During Shift — Silent Tracking

The system records every financial event against the active shift without exposing aggregates to the cashier:

| Event Type | Tracked Data |
|------------|-------------|
| Sale | order_id, payment_method, amount |
| Refund | order_id, payment_method, amount (negative) |
| Void | order_id, original amount |

All entries are written to `shift_transactions` in real time. The cashier's view remains limited to:

- Current cart contents and total
- Individual transaction receipts (after completion)
- Number of transactions processed (count only, no dollar totals)

**What the cashier cannot see during shift:**
- Running cash total
- Running sales total
- Expected drawer amount
- Any aggregate financial figure

---

## Close Shift — Blind Cash Close

The blind close is the core integrity mechanism. It forces honest counting by deliberately hiding the expected total until after the physical count is submitted.

### Flow

1. CASHIER clicks "End Shift" in sidebar
2. Confirmation modal: "Are you sure you want to end your shift?"
3. On confirm: Modal appears with single input — "Enter cash count from drawer"
4. **System does NOT display the expected total at this point**
5. Cashier enters physical count
6. System calculates:
   ```
   expected_total = opening_float
                     + SUM(cash sales)
                     - SUM(cash refunds)
   discrepancy    = closing_count - expected_total
   ```
7. Record is saved to `shift_reconciliations`
8. Cashier sees: "Shift closed. Report sent to owner."
9. WhatsApp alert dispatched to OWNER

### Why Blind

If the cashier sees the expected total before entering the count, they can adjust their count to match. Blind close removes that opportunity. The cashier must count honestly, and discrepancies reveal themselves to management.

---

## Discrepancy Handling

| Condition | Classification | Action |
|-----------|---------------|--------|
| `discrepancy > 0` | **Overage** | Logged. MANAGER/OWNER notified. Typically benign (customer overpaid, rounded up). |
| `discrepancy < 0` | **Shortage** | Logged. MANAGER/OWNER notified. Flagged for review. Repeated shortages trigger escalation. |
| `discrepancy = 0` | **Balanced** | Logged. No alert. |

All discrepancies are stored in the `shift_reconciliations` table with full context: expected, actual, difference, cashier, timestamp.

---

## Role-Based Visibility

### CASHIER

- Sees their own shift start/end times only
- Cannot view discrepancies, expected totals, or aggregate data
- Cannot access other cashiers' shift records
- Cannot void or refund after shift closes (transactions are locked)

### MANAGER

- Sees all cashiers' shifts for their entity
- Sees discrepancies for every shift
- Can view summary: shift duration, transaction count, payment method breakdown
- Cannot modify shift records after close

### OWNER

- Sees full detail for all shifts across their entity
- Transaction-by-transaction breakdown per shift
- Discrepancy trends over time (via Admin Hub analytics)
- Z-report access (end-of-day aggregation)
- WhatsApp alerts on every shift close

---

## WhatsApp Alert

On every shift close, the system sends a WhatsApp message to the entity's OWNER:

```
Shift closed by [cashier_name].
Expected: Nu. X
Actual: Nu. Y
Difference: Nu. Z ([Overage/Shortage/Balanced])
Time: [shift_start] → [shift_end]
Transactions: [count]
```

Dispatched via the existing `whatsapp-gateway` service using the OWNER's `whatsapp_no` from the `entities` table.

---

## Multiple Cashiers / Multiple Shifts

- Each shift is fully independent — no shared state between cashiers
- A store can have any number of shifts per day
- Only one shift can be ACTIVE at a time per POS terminal
- If a second terminal exists, it runs its own independent shift
- Drawer handoff protocol applies when one cashier relieves another on the same terminal

---

## Z-Report (End-of-Day)

Generated after the last shift of the day closes. Available in Admin Hub.

### Aggregated Data

| Metric | Source |
|--------|--------|
| Total shifts | Count of CLOSED shifts for the day |
| Total sales by payment method | SUM from `shift_transactions` grouped by `payment_method` |
| Total refunds | SUM of REFUND transactions across all shifts |
| Total voids | COUNT of VOID transactions across all shifts |
| Net cash | Cash sales - Cash refunds |
| Net digital | Digital sales - Digital refunds |
| Discrepancy total | SUM of all shift discrepancies |
| Opening float (first shift) | `opening_float` from earliest shift |
| Closing count (last shift) | `closing_count` from latest shift |

### Access

- OWNER: Full Z-report with per-shift drill-down
- MANAGER: Summary Z-report (no cashier names if owner prefers anonymity)
- CASHIER: No access

---

## Database Schema

### `shifts` Table

```sql
CREATE TABLE shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  opened_by       UUID NOT NULL REFERENCES user_profiles(id),
  closed_by       UUID REFERENCES user_profiles(id),
  opening_float   DECIMAL(12,2) NOT NULL CHECK (opening_float >= 0),
  closing_count   DECIMAL(12,2),
  expected_total  DECIMAL(12,2),
  discrepancy     DECIMAL(12,2),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'CLOSING', 'CLOSED')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One active shift per entity at a time
CREATE UNIQUE INDEX idx_shifts_one_active
  ON shifts (entity_id)
  WHERE status IN ('ACTIVE', 'CLOSING');

-- RLS: tenant isolation
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_tenant_isolation" ON shifts
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );
```

### `shift_transactions` Table

```sql
CREATE TABLE shift_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id         UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  order_id         UUID REFERENCES transactions(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'VOID')),
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT')),
  amount           DECIMAL(12,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of all transactions for a shift
CREATE INDEX idx_shift_transactions_shift
  ON shift_transactions (shift_id, created_at);

-- RLS: tenant isolation via shift relationship
ALTER TABLE shift_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_transactions_tenant" ON shift_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );
```

### `shift_reconciliations` Table

```sql
CREATE TABLE shift_reconciliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL UNIQUE REFERENCES shifts(id),
  expected_total  DECIMAL(12,2) NOT NULL,
  actual_count    DECIMAL(12,2) NOT NULL,
  discrepancy     DECIMAL(12,2) NOT NULL,
  classification  TEXT NOT NULL CHECK (classification IN ('OVERAGE', 'SHORTAGE', 'BALANCED')),
  reviewed_by     UUID REFERENCES user_profiles(id),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: tenant isolation via shift relationship
ALTER TABLE shift_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_reconciliations_tenant" ON shift_reconciliations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );
```

---

## API Routes

### `POST /api/shifts/open`

Opens a new shift. Validates that no other shift is ACTIVE for this entity.

**Request:**
```json
{
  "opening_float": 5000.00
}
```

**Response:**
```json
{
  "shift_id": "uuid",
  "opened_at": "2026-04-19T08:00:00Z",
  "status": "ACTIVE"
}
```

### `POST /api/shifts/:id/close`

Initiates blind close. Accepts physical cash count, calculates discrepancy, and marks shift as CLOSED.

**Request:**
```json
{
  "closing_count": 12500.00
}
```

**Response:**
```json
{
  "shift_id": "uuid",
  "closed_at": "2026-04-19T17:30:00Z",
  "status": "CLOSED",
  "message": "Shift closed. Report sent to owner."
}
```

Note: The response does NOT include expected_total or discrepancy for CASHIER role. MANAGER and OWNER roles receive the full reconciliation in the response.

### `GET /api/shifts/current`

Returns the active shift for the current entity. Used by POS to determine shift state on load.

**Response (CASHIER role):**
```json
{
  "shift_id": "uuid",
  "opened_at": "2026-04-19T08:00:00Z",
  "status": "ACTIVE",
  "transaction_count": 47
}
```

**Response (MANAGER/OWNER role):**
```json
{
  "shift_id": "uuid",
  "opened_at": "2026-04-19T08:00:00Z",
  "opened_by": "uuid",
  "status": "ACTIVE",
  "transaction_count": 47,
  "running_totals": {
    "cash_sales": 8200.00,
    "digital_sales": 15400.00,
    "cash_refunds": 300.00,
    "voids": 2
  }
}
```

### `GET /api/shifts/history`

Returns past shifts with role-filtered detail.

**Query params:** `?date=2026-04-19` or `?cashier_id=uuid`

### `GET /api/shifts/z-report`

Generates end-of-day Z-report for the specified date.

**Query params:** `?date=2026-04-19`

---

## UI Components

### ShiftStatusBadge

- Sidebar indicator showing current shift state
- ACTIVE: Gold pulse animation with shift start time
- No shift: Grey "Start Shift" button
- CLOSING: Tibetan red with "Count in progress"

### StartShiftModal

- Simple modal with numeric input for opening float
- Large keypad for touch/click entry
- "Start Shift" confirmation button

### EndShiftModal

- Confirmation step: "End your shift?"
- Count entry step: Single numeric input — "Count cash in drawer"
- No hint, no expected amount, no suggestion
- Submit: "Shift closed. Report sent to owner."

### ShiftHistoryPanel

- Desktop sidebar panel
- CASHIER: Own shifts only, start/end times, transaction count
- MANAGER: All cashiers, includes discrepancy column
- OWNER: All cashiers, discrepancy column, drill-down to transaction list

---

## Dependencies

| Dependency | Feature ID | Reason |
|-----------|-----------|--------|
| Desktop POS Layout | F-DESKTOP-001 | Shift controls only appear in desktop sidebar |
| Role-Based Auth | F-AUTH-001 | Role visibility filtering (CASHIER/MANAGER/OWNER) requires sub_role from JWT |

---

## Implementation Checklist

- [ ] Create `shifts` table with RLS policies
- [ ] Create `shift_transactions` table with RLS policies
- [ ] Create `shift_reconciliations` table with RLS policies
- [ ] Create unique partial index enforcing one active shift per entity
- [ ] Build `POST /api/shifts/open` route with float validation
- [ ] Build `POST /api/shifts/:id/close` route with blind close logic
- [ ] Build `GET /api/shifts/current` route with role-filtered response
- [ ] Build `GET /api/shifts/history` route with date/cashier filters
- [ ] Build `GET /api/shifts/z-report` route with daily aggregation
- [ ] Implement shift_transaction auto-creation on SALE/REFUND/VOID events
- [ ] Build StartShiftModal component with numeric keypad
- [ ] Build EndShiftModal component with blind count entry
- [ ] Build ShiftStatusBadge component for sidebar
- [ ] Build ShiftHistoryPanel with role-filtered views
- [ ] Implement drawer handoff flow (closing count → opening float confirmation)
- [ ] Add discrepancy calculation engine (expected_total derivation)
- [ ] Integrate WhatsApp alert on shift close via whatsapp-gateway
- [ ] Add Z-report generation in Admin Hub
- [ ] Add Z-report export to PDF (optional)
- [ ] Write unit tests for discrepancy calculation (overage, shortage, balanced)
- [ ] Write unit tests for blind close — verify cashier never sees expected_total
- [ ] Write integration tests for RLS — cashier cannot read other cashiers' shifts
- [ ] Write integration tests for concurrent shift prevention (one active per entity)
- [ ] Add audit log entries for shift open, close, and reconciliation events

---

## Resolved Decisions

**Q: Should cashiers see a running transaction count during their shift?**
A: **Yes, count only.** Cashier sees how many transactions they have processed but no dollar totals. This gives a sense of activity without compromising blind close integrity.

**Q: What happens if the POS crashes mid-shift?**
A: **Shift remains ACTIVE.** On reload, POS detects the open shift and resumes. No data loss — all `shift_transactions` are written in real time. Cashier can continue or end shift normally.

**Q: Can a MANAGER force-close a cashier's shift?**
A: **Yes.** MANAGER can initiate close on behalf of an absent cashier. The `closed_by` field records the MANAGER's user ID, not the original cashier. Discrepancy is still calculated against the opening float declared by the original cashier.

**Q: Should digital payments (mBoB, mPay) be included in the blind count?**
A: **No.** Blind close counts physical cash only. Digital payments are system-verified and do not require physical reconciliation. The `expected_total` formula includes only cash transactions. Digital totals are shown separately in the Z-report.

**Q: What if the store has multiple POS terminals?**
A: **Each terminal runs its own independent shift.** The one-active-shift-per-entity constraint applies per physical drawer, not per entity. If the store has two terminals with two cash drawers, both can have active shifts simultaneously. This requires a `terminal_id` or `drawer_id` field to be added if multi-terminal support is needed. Currently scoped to single-terminal per entity.
