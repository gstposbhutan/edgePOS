# Feature: Vision-to-Bill Reconciliation (Anti-Theft)

**Feature ID**: F-AUDIT-001
**Phase**: 5
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Desktop-only feature that uses the overhead camera to independently verify what items sit on the checkout counter against what the cashier actually rings up. When a transaction moves to payment, the AI takes a snapshot, runs product detection, and cross-references detected items with the cart contents. Discrepancies — items the camera sees but the bill does not include, or items on the bill that the camera cannot find — are logged and silently reported to the store owner via WhatsApp. The cashier never sees the audit results.

This is a loss-prevention tool, not a checkout tool. It leverages the same YOLO26 pipeline built for vision checkout (Phase 4) but runs it in an independent comparison loop at payment time rather than during item entry.

---

## Platform Scope

**Desktop only.** This feature requires the overhead camera mounted above the checkout counter — hardware configured as part of F-DESKTOP-001. It does not appear on tablet or mobile POS layouts. The feature is always active when an overhead camera is connected and a shift is in progress. No toggle is exposed to the cashier.

---

## How It Works

### Detection Trigger

The vision-to-bill comparison runs at a single, well-defined moment: when the cashier clicks the "Payment" button to move from cart view to checkout. At that point:

1. The overhead camera captures a single high-resolution frame of the counter surface.
2. The frame is passed through the YOLO26 pipeline for localization and SKU classification (same pipeline as vision checkout, Phase 4).
3. The detected items list is assembled with product identifiers, quantities, and per-item confidence scores.
4. The detected items are compared against the current cart contents.
5. Discrepancies are classified and recorded.
6. If any high-confidence discrepancy exists, a WhatsApp alert is dispatched to the OWNER.

The cashier proceeds to checkout normally. There is no delay, no modal, no interruption to the payment flow.

### Detection Pipeline (Reuse of Phase 4)

The feature does not introduce a new inference pipeline. It calls the existing YOLO26 detection engine with a single frame instead of a continuous stream:

| Stage | Source | Output |
|-------|--------|--------|
| Capture | Overhead camera (single frame) | 4K image of counter surface |
| Localization | YOLO26 `yolo26s_end2end.onnx` | Bounding boxes for all visible items |
| Classification | MobileNet-V3 feature extractor + local embedding DB | Product IDs with confidence scores |

The single-frame capture means no continuous GPU load. Inference runs once per transaction at payment time.

---

## Discrepancy Types

### MISSING FROM BILL

Camera detects an item that is not present in the cart. The cashier may be skipping the item — giving a "friend discount," under-ringing, or intentionally omitting products.

**Example**: Camera sees Red Bull can on counter. Cart does not contain Red Bull. Flagged as MISSING FROM BILL.

### EXTRA ON BILL

Cart contains an item that the camera cannot detect on the counter. The cashier may be ringing up wrong products, overcharging, or adding items not present in the transaction.

**Example**: Cart contains 2x Lux Soap. Camera does not detect Lux Soap on counter. Flagged as EXTRA ON BILL.

### QUANTITY MISMATCH

Both the camera and cart contain the same product, but quantities differ. The cashier may be partially skipping items.

**Example**: Camera detects 3 Red Bull cans. Cart contains 2 Red Bull. Flagged as QUANTITY MISMATCH with camera_qty=3, cart_qty=2.

---

## Confidence Threshold

Detection results below 85% confidence are not treated as actionable discrepancies. Low-confidence detections are logged but do not trigger owner alerts.

| Confidence | Classification | Action |
|-----------|---------------|--------|
| >= 85% | **High confidence** | Discrepancy recorded. Owner alerted via WhatsApp. |
| 50% – 84% | **Low confidence** | Discrepancy recorded as `low_confidence: true`. No alert. Available for MANAGER review in Admin Hub. |
| < 50% | **Ignored** | Not recorded. Below usable detection threshold. |

The 85% threshold applies per detected item, not to the frame as a whole. A frame may contain 5 detected items, 4 above 85% and 1 at 70%. Only the 4 high-confidence items participate in the discrepancy comparison. The 5th is logged as low confidence and excluded from alert logic.

---

## Alert Handling

### Cashier Visibility

**None.** The cashier is never informed that a vision audit detected a discrepancy. No banner, no modal, no notification, no status indicator. The audit runs silently in the background. The payment flow continues uninterrupted.

### Owner Notification (WhatsApp)

When a high-confidence discrepancy is detected, the system sends a WhatsApp message to the entity's OWNER via the existing `whatsapp-gateway` service:

```
Item mismatch detected:

Camera saw: [3x Red Bull]
Bill contains: [2x Red Bull]

Type: QUANTITY MISMATCH
Cashier: [cashier_name]
Shift: [shift_id]
Order: [order_no]
Time: [timestamp]
```

For MISSING FROM BILL:

```
Item mismatch detected:

Camera saw: [1x Lux Soap]
Bill contains: [not present]

Type: MISSING FROM BILL
Cashier: [cashier_name]
Shift: [shift_id]
Order: [order_no]
Time: [timestamp]
```

For EXTRA ON BILL:

```
Item mismatch detected:

Camera saw: [not detected]
Bill contains: [2x Lux Soap]

Type: EXTRA ON BILL
Cashier: [cashier_name]
Shift: [shift_id]
Order: [order_no]
Time: [timestamp]
```

Messages are dispatched to the OWNER's `whatsapp_no` from the `entities` table.

### Alert Batching

To avoid flooding the owner with WhatsApp messages during a busy shift, alerts can be batched:

- **Real-time mode (default)**: Each discrepancy alert is sent immediately.
- **Batched mode** (configurable per entity): Alerts are accumulated during the shift and sent as a single summary when the shift closes. The shift close WhatsApp message includes a "Vision Audit" section listing all discrepancies.

---

## Privacy Considerations

### Camera Scope

The overhead camera watches only the counter surface — the flat area where products are placed for checkout. The camera angle must be configured during hardware setup (F-DESKTOP-001) to ensure:

- The field of view covers the counter surface and nothing beyond it.
- Cashier faces and customer faces are not captured.
- The camera does not point toward aisles, entryways, or any area where people stand.

### Documentation and Disclosure

- The camera angle and field of view must be documented during hardware setup with a reference photograph stored in the entity's configuration.
- A printed notice must be displayed at the checkout counter informing customers that product monitoring is in use. Suggested text: "This checkout uses automated product verification for accurate billing."
- No biometric data (faces, body shapes) is captured or processed by this feature.
- Vision audit records contain only product-level data, not images. The captured frame is processed in memory and discarded after detection completes.

---

## Integration with Shift Management (F-SHIFT-001)

### Shift Linkage

Every `vision_audits` record is linked to the active shift via `shift_id`. This enables:

- Per-shift discrepancy summaries in the Z-report.
- Historical analysis of discrepancies by cashier across shifts.
- Trend detection — if a specific cashier consistently triggers MISSING FROM BILL alerts, the pattern surfaces in Admin Hub analytics.

### Z-Report Extension

The Z-report (end-of-day summary from F-SHIFT-001) includes a Vision Discrepancy section:

| Metric | Source |
|--------|--------|
| Total vision audits | COUNT of `vision_audits` for all shifts on that date |
| Audits with discrepancies | COUNT where `discrepancies` JSONB is not empty |
| MISSING FROM BILL count | Aggregated from discrepancy classifications |
| EXTRA ON BILL count | Aggregated from discrepancy classifications |
| QUANTITY MISMATCH count | Aggregated from discrepancy classifications |
| Low-confidence detections | COUNT where items were logged but below 85% threshold |
| Affected cashiers | Distinct `opened_by` from linked shifts |

### Access

- OWNER: Full vision audit log with per-order drill-down.
- MANAGER: Summary statistics and per-cashier breakdown.
- CASHIER: No access to vision audit data.

---

## Database Schema

### `vision_audits` Table

```sql
CREATE TABLE vision_audits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  shift_id         UUID NOT NULL REFERENCES shifts(id),
  order_id         UUID NOT NULL REFERENCES transactions(id),
  detected_items   JSONB NOT NULL DEFAULT '[]',
  billed_items     JSONB NOT NULL DEFAULT '[]',
  discrepancies    JSONB NOT NULL DEFAULT '[]',
  confidence_score REAL NOT NULL DEFAULT 0,
  alerted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of audits for a shift
CREATE INDEX idx_vision_audits_shift
  ON vision_audits (shift_id, created_at);

-- Fast lookup of audits for an order
CREATE INDEX idx_vision_audits_order
  ON vision_audits (order_id);

-- Filter audits that triggered alerts
CREATE INDEX idx_vision_audits_alerted
  ON vision_audits (entity_id, alerted)
  WHERE alerted = TRUE;

-- RLS: tenant isolation
ALTER TABLE vision_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vision_audits_tenant_isolation" ON vision_audits
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );
```

### JSONB Schemas

#### `detected_items`

```json
[
  {
    "product_id": "uuid",
    "name": "Red Bull 250ml",
    "qty": 3,
    "confidence": 0.92
  }
]
```

#### `billed_items`

```json
[
  {
    "product_id": "uuid",
    "name": "Red Bull 250ml",
    "qty": 2
  }
]
```

#### `discrepancies`

```json
[
  {
    "type": "QUANTITY_MISMATCH",
    "product_id": "uuid",
    "name": "Red Bull 250ml",
    "camera_qty": 3,
    "cart_qty": 2,
    "confidence": 0.92,
    "action": "ALERTED"
  }
]
```

Valid `type` values: `MISSING_FROM_BILL`, `EXTRA_ON_BILL`, `QUANTITY_MISMATCH`.
Valid `action` values: `ALERTED` (confidence >= 85%), `LOGGED_LOW_CONFIDENCE` (confidence 50-84%).

---

## API Routes

### `POST /api/vision-audit/run`

Triggered internally when the cashier moves to payment. Not exposed as a user-facing endpoint — called by the POS backend during the payment flow.

**Request:**
```json
{
  "order_id": "uuid",
  "shift_id": "uuid"
}
```

**Response:**
```json
{
  "audit_id": "uuid",
  "discrepancy_count": 1,
  "alerted": true
}
```

The response is consumed internally. The cashier never sees it.

### `GET /api/vision-audit/history`

Returns vision audit records for the entity. Only accessible to MANAGER and OWNER roles.

**Query params:** `?date=2026-04-19` or `?shift_id=uuid` or `?cashier_id=uuid`

### `GET /api/vision-audit/summary`

Aggregated discrepancy statistics for a date range. Used by Admin Hub analytics.

**Query params:** `?from=2026-04-01&to=2026-04-19`

---

## Comparison Algorithm

```
Input: detected_items[], cart_items[]
Output: discrepancies[]

For each detected_item:
  match = find cart_item with same product_id

  if no match found:
    if detected_item.confidence >= 0.85:
      discrepancies.append(MISSING_FROM_BILL)
    else:
      log as low_confidence

  else if match found and detected_item.qty != cart_item.qty:
    if detected_item.confidence >= 0.85:
      discrepancies.append(QUANTITY_MISMATCH, camera_qty, cart_qty)
    else:
      log as low_confidence

  else:
    // item matched, quantities match — no discrepancy
    pass

For each cart_item:
  match = find detected_item with same product_id

  if no match found:
    // camera did not see this item on the counter
    discrepancies.append(EXTRA_ON_BILL)

  else:
    // already handled in first pass
    pass
```

---

## UI Components

### No Cashier-Facing Components

This feature has zero visual footprint in the cashier's POS interface. No badges, no indicators, no panels. The audit is invisible to the cashier by design.

### Admin Hub: VisionAuditPanel

- Located in Admin Hub under a "Loss Prevention" section
- OWNER: Full audit log with order details, detected vs. billed item lists, discrepancy classification, cashier name, timestamp
- MANAGER: Summary view with per-cashier discrepancy counts and trends
- Filter by date, cashier, discrepancy type

### Admin Hub: CashierRiskScorecard

- Aggregated view showing discrepancy frequency per cashier over time
- Highlights cashiers with recurring MISSING FROM BILL or QUANTITY MISMATCH flags
- Trend graph: discrepancies per shift over last 30 days
-OWNER only

---

## Dependencies

| Dependency | Feature ID | Reason |
|-----------|-----------|--------|
| Desktop Shell (overhead camera) | F-DESKTOP-001 | Overhead camera hardware routing and stream access |
| YOLO26 Vision Pipeline | Phase 4 | Localization and classification inference engine |
| Shift Management | F-SHIFT-001 | Shift linkage, Z-report integration, cashier identity |

---

## Implementation Checklist

- [ ] Create `vision_audits` table with RLS policies
- [ ] Create indexes on `vision_audits` (shift_id, order_id, alerted partial)
- [ ] Implement `POST /api/vision-audit/run` internal route
- [ ] Implement single-frame capture from overhead camera at payment trigger
- [ ] Implement comparison algorithm (detected_items vs. cart_items)
- [ ] Implement confidence threshold filtering (85% for alerts, 50% for logging)
- [ ] Implement discrepancy classification (MISSING_FROM_BILL, EXTRA_ON_BILL, QUANTITY_MISMATCH)
- [ ] Integrate WhatsApp alert dispatch via `whatsapp-gateway` for high-confidence discrepancies
- [ ] Implement alert batching mode (configurable per entity)
- [ ] Implement `GET /api/vision-audit/history` route with role filtering (MANAGER/OWNER only)
- [ ] Implement `GET /api/vision-audit/summary` route for Admin Hub analytics
- [ ] Extend Z-report generation (F-SHIFT-001) with Vision Discrepancy section
- [ ] Build Admin Hub `VisionAuditPanel` component with discrepancy log view
- [ ] Build Admin Hub `CashierRiskScorecard` component with per-cashier trend analysis
- [ ] Add camera field-of-view documentation tool in hardware setup flow
- [ ] Add printed notice text template for counter display
- [ ] Ensure captured frames are processed in memory and discarded (no image storage)
- [ ] Verify RLS policies prevent CASHIER role from reading `vision_audits`
- [ ] Write unit tests for comparison algorithm (all three discrepancy types, edge cases)
- [ ] Write unit tests for confidence threshold logic (boundary at 85% and 50%)
- [ ] Write integration tests for WhatsApp alert dispatch on high-confidence discrepancies
- [ ] Write integration tests for Z-report vision discrepancy section
- [ ] Add audit log entries for vision audit creation and alert dispatch events
- [ ] Performance test: verify single-frame inference does not delay payment flow (>500ms budget)

---

## Resolved Decisions

**Q: Should discrepancies block the payment flow or pause checkout?**
A: **No.** The audit runs asynchronously. The cashier proceeds to payment without any delay or interruption. Blocking the flow would alert the cashier that monitoring is active and defeat the purpose of silent detection.

**Q: Why 85% confidence threshold for owner alerts?**
A: **Balance between noise and detection.** Below 85%, false positives from the vision pipeline (similar packaging, occluded items, lighting changes) would flood the owner with inaccurate alerts. At 85% and above, the YOLO26 + MobileNet-V3 pipeline is reliable enough that alerts represent genuine discrepancies worth investigating. Low-confidence detections are still logged for pattern analysis.

**Q: Should captured frames be stored for later review?**
A: **No.** Frames are processed in memory and discarded after detection completes. Storing images of the counter surface creates data liability and storage overhead. The structured discrepancy record (product names, quantities, confidence scores) is sufficient for investigation. If visual evidence is needed in the future, this decision can be revisited with explicit opt-in and retention policies.

**Q: What if the overhead camera is disconnected?**
A: **Silent degradation.** The vision audit is skipped for that transaction. A `no_audit_reason: 'camera_disconnected'` field is logged on the order record. The OWNER receives a daily summary of skipped audits (if any) as part of the Z-report. The feature does not block checkout when the camera is unavailable.

**Q: Why link audits to shifts instead of just orders?**
A: **Pattern detection.** Individual discrepancies may be benign. A cashier who triggers 12 MISSING FROM BILL alerts across 5 shifts is a pattern. Linking to shifts enables per-cashier trend analysis and the CashierRiskScorecard in Admin Hub. Orders alone would require additional queries to correlate discrepancies with the cashier who was working.

**Q: Should the feature be toggleable?**
A: **Yes, at the entity level.** OWNER can disable vision auditing from Admin Hub settings. When disabled, no frames are captured, no audits are recorded, and no WhatsApp alerts are sent. The default is enabled when an overhead camera is configured.
