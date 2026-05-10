# Feature: Photo-to-Stock (Wholesale Bill OCR)

**Feature ID**: F-PHOTO-001
**Phase**: 5
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Retailers receive supplier deliveries throughout the day, often accompanied by handwritten or printed wholesale bills in a mix of English and Dzongkha. Currently, every incoming item must be manually entered into inventory -- a slow, error-prone process for shopkeepers who may not be tech-literate. Photo-to-Stock lets the retailer snap a photo of the delivery note, automatically parses every line item via Gemini Vision OCR, and presents a "Draft Purchase" for quick review and confirmation. Once confirmed, inventory is restocked automatically.

The primary use case is the PWA: the shopkeeper walks the shop floor, receives a delivery, opens inventory, taps "Scan Bill," and points the phone camera at the bill. Desktop users can also upload a photo file through the same interface.

---

## User Flow

```
User opens Inventory screen on POS or Admin Hub
  -> Taps "Scan Bill" button (camera icon, prominent placement)
  -> Camera viewfinder opens (PWA) OR file upload picker opens (desktop)
  -> User captures / uploads photo of wholesale bill
  -> Photo sent to /api/bill-parse
  -> Gemini Vision OCR extracts structured line items
  -> User sees "Draft Purchase" screen:
       - Each OCR line shown as editable row
       - Product name matched against catalog (colour-coded confidence)
       - Quantity, unit, unit price, line total shown
       - Supplier name (if detected) auto-linked
  -> User reviews, corrects mismatches, adjusts quantities
  -> User taps "Confirm Purchase"
  -> Draft status: CONFIRMED
  -> inventory_movements created (RESTOCK type) for each line item
  -> products.current_stock updated
  -> Original photo attached to draft purchase record for audit
```

---

## OCR Extraction Targets

The vision AI prompt extracts the following fields from each line on the bill.

| Field | Description | Example |
|-------|-------------|---------|
| Product name | Raw text as read from bill | "Tata Salt 1kg", "Noodle pkt" |
| Quantity | Numeric quantity | 12, 5 |
| Unit | Packaging unit | pcs, pkt, ctn, box, bag, kg, ltr |
| Unit price | Price per unit | 25.00, 350.50 |
| Line total | Quantity x Unit price | 300.00 |
| Supplier name | Business name printed on bill header | "Tashi Trading Corp." |
| Bill date | Date on the bill | "19/04/2026" |
| Bill number | Invoice or challan number | "INV-4521" |

### Handwriting and Language Support

Gemini Vision handles both printed and handwritten text. Bhutanese wholesale bills commonly mix Dzongkha script and English. The prompt instructs the model to:
- Transliterate Dzongkha product names into English equivalents where possible
- Preserve the original script in `ocr_raw` JSONB for reference
- Flag lines where handwriting confidence is below threshold for manual review

---

## Fuzzy Product Matching

OCR product names are matched against the retailer's local product catalog. This is essential because handwritten bills will never perfectly match database entries.

### Confidence Tiers

| Confidence | Visual Indicator | Behaviour |
|------------|-----------------|-----------|
| > 90% | Green checkmark, row auto-highlighted | Auto-matched. `product_id` populated. User can still change. |
| 60% - 90% | Yellow dot, suggestion shown | Suggestion displayed with "Did you mean [Product]?" prompt. User taps to confirm or selects a different product. |
| < 60% | Red dot, "New Product" label | No match found. Row shows "Create New Product" button. User enters details inline. |

### Matching Algorithm

1. Normalize OCR text: lowercase, strip whitespace, remove common suffixes (pkt, pcs, kg)
2. Compute similarity score against each product name in local catalog using token-set ratio
3. If multiple products score above 90%, pick the highest
4. Cache match results for the session to avoid re-computation

---

## Draft Purchase Lifecycle

```
DRAFT -> REVIEWED -> CONFIRMED
  |                    |
  v                    v
CANCELLED          (inventory updated)
```

### State Descriptions

| Status | Description |
|--------|-------------|
| `DRAFT` | Initial state after OCR parse. User can edit everything: product matches, quantities, prices, supplier. |
| `REVIEWED` | User has finished editing and tapped "Review." Final summary shown. No edits allowed, only Confirm or Cancel. |
| `CONFIRMED` | User confirmed. Inventory movements created. Stock updated. Immutable. |
| `CANCELLED` | User cancelled the draft. No inventory changes. Photo retained for audit. |

### DRAFT State Edits

In the `DRAFT` state, the user can:
- Change the matched product (search and select from catalog)
- Adjust quantity, unit, unit price, and line total
- Add new line items (for items OCR missed)
- Remove line items (for items OCR hallucinated)
- Set or change the supplier
- View the original bill photo side-by-side

### CONFIRMED State Effects

When a draft purchase transitions to `CONFIRMED`:
- One `inventory_movements` record per line item (`movement_type: 'RESTOCK'`)
- `products.current_stock` incremented by the line item quantity
- `draft_purchases.confirmed_at` and `confirmed_by` set
- Draft becomes read-only

---

## Supplier Detection

- If the OCR detects a supplier name on the bill header, it is fuzzy-matched against the `suppliers` table (or `entities` where role is DISTRIBUTOR/WHOLESALER)
- If a match is found, `supplier_id` is auto-populated
- If no match is found, a draft supplier entry is suggested with the OCR-detected name pre-filled for the user to confirm or discard
- Supplier is optional -- the user can skip it if the bill has no supplier information

---

## Platform Support

| Platform | Input Method | Primary Use Case |
|----------|-------------|------------------|
| PWA (mobile) | Rear camera, live viewfinder | Walking the floor, snapping delivery notes |
| Desktop POS | File upload via drag-and-drop or file picker | Entering bills at the counter from a stack |
| Tablet | Either camera or file upload | Flexible based on tablet setup |

Both platforms hit the same `/api/bill-parse` endpoint. The client-side component detects platform capabilities and renders the appropriate input UI.

---

## API Route

### `POST /api/bill-parse`

**Request** (multipart/form-data):
- `image`: captured photo or uploaded file (required)
- `entity_id`: the retailer's entity UUID (required)

**Response**:
```json
{
  "draft_purchase_id": "uuid",
  "supplier_name": "Tashi Trading Corp.",
  "supplier_id": "uuid-or-null",
  "bill_date": "2026-04-19",
  "bill_number": "INV-4521",
  "total_amount": 4500.00,
  "items": [
    {
      "ocr_product_name": "Tata Salt 1kg",
      "matched_product_id": "uuid-or-null",
      "matched_product_name": "Tata Salt 1kg",
      "match_confidence": 0.95,
      "quantity": 12,
      "unit": "pkt",
      "unit_price": 25.00,
      "line_total": 300.00
    }
  ],
  "ocr_raw": {
    "full_text": "...",
    "raw_items": [...],
    "handwriting_confidence": 0.82,
    "detected_languages": ["en", "dz"]
  }
}
```

The endpoint creates a `draft_purchases` record in `DRAFT` status with all extracted data, and returns the full draft for the client to render the review screen.

---

## Database Changes

### `draft_purchases` table (new)

```sql
CREATE TABLE draft_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  supplier_id     UUID REFERENCES entities(id),          -- nullable until matched
  photo_url       TEXT NOT NULL,                          -- Supabase Storage path
  photo_hash      TEXT NOT NULL,                          -- SHA-256 of original photo
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'REVIEWED', 'CONFIRMED', 'CANCELLED')),
  bill_date       DATE,
  bill_number     TEXT,
  total_amount    DECIMAL(12,2) DEFAULT 0,
  ocr_raw         JSONB,                                 -- full OCR response for audit
  created_by      UUID REFERENCES user_profiles(id),
  confirmed_by    UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

CREATE INDEX idx_draft_purchases_entity ON draft_purchases(entity_id);
CREATE INDEX idx_draft_purchases_status ON draft_purchases(status);
```

### `draft_purchase_items` table (new)

```sql
CREATE TABLE draft_purchase_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_purchase_id     UUID NOT NULL REFERENCES draft_purchases(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id),    -- nullable until matched/created
  ocr_product_name      TEXT NOT NULL,                   -- raw name from OCR
  matched_product_name  TEXT,                            -- catalog name if matched
  quantity              DECIMAL(10,2) NOT NULL,
  unit                  TEXT NOT NULL DEFAULT 'pcs',
  unit_price            DECIMAL(10,2) NOT NULL,
  line_total            DECIMAL(12,2) NOT NULL,
  match_confidence      DECIMAL(3,2),                    -- 0.00 to 1.00
  sort_order            INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_purchase_items_draft ON draft_purchase_items(draft_purchase_id);
```

### `inventory_movements` interaction

On CONFIRMED, the existing `inventory_movements` table receives one row per line item:

```
movement_type: 'RESTOCK'
product_id: from draft_purchase_items.product_id
entity_id: from draft_purchases.entity_id
quantity: from draft_purchase_items.quantity
reference_id: draft_purchases.id
```

`products.current_stock` is incremented accordingly.

---

## Vision AI Prompt Design

```
You are a wholesale bill parser for a Bhutan POS system (NEXUS BHUTAN).

Analyze this photo of a wholesale delivery note or bill. The bill may be
handwritten, printed, or a mix of both. It may contain text in English and/or
Dzongkha script.

Extract the following information:

1. Supplier name (usually printed at the top of the bill as a letterhead or header)
2. Bill date
3. Bill number / invoice number / challan number
4. Each line item:
   - Product name (as written on the bill; transliterate Dzongkha to English
     where possible)
   - Quantity (numeric)
   - Unit (pcs, pkt, ctn, box, bag, kg, ltr, or as written)
   - Unit price
   - Line total (quantity x unit price)
5. Total amount on the bill
6. Whether the bill appears handwritten, printed, or mixed
7. Languages detected on the bill

Rules:
- If a field is unclear or unreadable, set it to null rather than guessing.
- Preserve the original product name spelling even if it seems misspelled.
- If line total and quantity x unit price do not match, report both values.

Respond ONLY with valid JSON, no markdown:
{
  "supplierName": "<string or null>",
  "billDate": "<YYYY-MM-DD or null>",
  "billNumber": "<string or null>",
  "items": [
    {
      "productName": "<string>",
      "quantity": <number or null>,
      "unit": "<string or null>",
      "unitPrice": <number or null>,
      "lineTotal": <number or null>
    }
  ],
  "totalAmount": <number or null>,
  "billType": "HANDWRITTEN" | "PRINTED" | "MIXED",
  "languagesDetected": ["en", "dz"],
  "overallConfidence": <0.0 to 1.0>,
  "notes": "<any observations about readability or issues>"
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Blurry or dark photo | OCR returns low `overallConfidence` (< 0.50). Front-end shows "Image unclear -- please retake" with option to retry or enter items manually. |
| OCR hallucinates extra items | User can remove line items in DRAFT state before confirming. |
| OCR misses items on a dense bill | User can add line items manually in DRAFT state. |
| Bill has no supplier name | `supplier_id` remains null. User can manually select a supplier or skip. |
| Product exists in catalog but under a different name | Fuzzy matching catches common aliases (e.g., "Maggi Noodle" matches "Maggi 2-Minute Noodles 70g"). User confirms the match. |
| Same bill photographed twice | Duplicate detection on `photo_hash`. If a draft already exists with the same hash, prompt user: "This bill may have already been scanned. Open existing draft?" |
| User goes offline after capture | Draft saved to local IndexedDB. Syncs to Supabase when connectivity resumes. Draft remains editable. |
| Bill in pure Dzongkha script | Gemini Vision transliterates product names. Original Dzongkha preserved in `ocr_raw`. User can correct transliteration errors. |
| Partial bill (torn, cropped) | OCR extracts whatever is visible. User adds missing items manually. |
| Mixed currencies on bill | If Indian Rupee amounts detected alongside Ngultrum, flag for user to confirm which currency applies. Default to Ngultrum. |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Image upload to OCR result | < 5 seconds |
| Fuzzy product matching (per item, catalog up to 500 products) | < 200ms |
| Draft save (local IndexedDB) | < 100ms |
| Confirm draft (create movements + update stock) | < 2 seconds |
| OCR accuracy on printed bills | > 95% |
| OCR accuracy on handwritten bills | > 80% |
| Product match accuracy (confidence > 90% tier) | > 90% |

---

## Implementation Checklist

### Schema
- [ ] Create `draft_purchases` table
- [ ] Create `draft_purchase_items` table
- [ ] Add index on `draft_purchases(entity_id)`
- [ ] Add index on `draft_purchases(status)`
- [ ] Add index on `draft_purchase_items(draft_purchase_id)`
- [ ] Add Supabase Storage bucket for bill photos
- [ ] Add RLS policies: retailers can only see their own drafts

### Server-Side (`app/api/bill-parse/route.js`)
- [ ] Accept multipart image upload + entity_id
- [ ] Compute SHA-256 hash of image for duplicate detection
- [ ] Call Gemini Vision API with bill-parsing prompt
- [ ] Parse structured JSON response
- [ ] Run fuzzy product matching against retailer's product catalog
- [ ] Create `draft_purchases` record in DRAFT status
- [ ] Create `draft_purchase_items` records for each extracted line
- [ ] Store original photo in Supabase Storage
- [ ] Return full draft with match results

### Server-Side (`app/api/draft-purchases/[id]/route.js`)
- [ ] GET: fetch single draft with items
- [ ] PATCH: update draft items (edit matches, quantities, prices)
- [ ] POST confirm: transition to CONFIRMED, create inventory_movements, update current_stock
- [ ] POST cancel: transition to CANCELLED

### Server-Side (`app/api/draft-purchases/route.js`)
- [ ] GET: list drafts for entity, filterable by status

### Client-Side (`components/inventory/scan-bill-modal.jsx`)
- [ ] Camera viewfinder for PWA (rear camera)
- [ ] File upload / drag-and-drop for desktop
- [ ] Platform detection to show correct input method
- [ ] Capture/upload triggers API call
- [ ] Loading state with progress indicator

### Client-Side (`components/inventory/draft-purchase-review.jsx`)
- [ ] Render OCR line items as editable rows
- [ ] Colour-coded confidence indicators (green/yellow/red)
- [ ] Product search and replace for mismatched items
- [ ] Inline "Create New Product" form for unmatched items
- [ ] Quantity, unit, price editing
- [ ] Add/remove line items
- [ ] Supplier selection / draft supplier creation
- [ ] Side-by-side original bill photo viewer
- [ ] Review summary screen (READONLY, before confirm)
- [ ] Confirm and Cancel buttons

### Client-Side (`components/inventory/draft-purchase-list.jsx`)
- [ ] List all drafts with status badges
- [ ] Filter by status (DRAFT, REVIEWED, CONFIRMED, CANCELLED)
- [ ] Tap to open draft for editing or viewing

### Client-Side (`lib/vision/bill-ocr.js`)
- [ ] `captureBillPhoto()` helper for camera capture
- [ ] `parseBill(image, entityId)` API call wrapper
- [ ] `confirmDraft(draftId)` API call wrapper
- [ ] `updateDraftItem(draftId, itemId, updates)` API call wrapper
- [ ] Fuzzy match scoring utility for client-side re-matching

### Offline Support
- [ ] Save captured photo to IndexedDB when offline
- [ ] Queue draft creation for sync when connectivity resumes
- [ ] Allow DRAFT editing offline
- [ ] Block CONFIRM until online (requires server-side stock update)

### Testing
- [ ] Unit tests: fuzzy matching confidence tiers (mock product catalog)
- [ ] Unit tests: draft state transitions (DRAFT -> REVIEWED -> CONFIRMED, DRAFT -> CANCELLED)
- [ ] Unit tests: line total calculation and validation
- [ ] Unit tests: duplicate photo hash detection
- [ ] Integration tests: full bill-parse pipeline with sample printed bill image
- [ ] Integration tests: full bill-parse pipeline with sample handwritten bill image
- [ ] Integration tests: confirm draft creates inventory_movements and updates current_stock
- [ ] Edge case tests: blurry image, torn bill, mixed Dzongkha, empty bill, no supplier

---

## Resolved Decisions

**Q: Why Gemini Vision instead of a local OCR model?**
A: Bhutanese wholesale bills mix Dzongkha and English in both handwritten and printed forms. Local OCR models (Tesseract, etc.) have poor Dzongkha support and struggle with handwriting. Gemini Vision handles multilingual handwritten text out of the box. Since this feature requires network connectivity anyway (to save the draft and update stock), the API latency is acceptable.

**Q: Why a draft lifecycle instead of immediate stock update?**
A: OCR is imperfect. Auto-updating stock from raw OCR results would introduce inventory errors that are hard to undo. The DRAFT -> REVIEWED -> CONFIRMED lifecycle gives the user explicit control over every line item before any stock changes happen. CANCELLED drafts leave no inventory footprint.

**Q: Why fuzzy matching instead of exact barcode matching?**
A: Wholesale bills rarely include barcodes. They list product names in freeform text, often handwritten. Fuzzy matching with confidence tiers is the practical solution. The user always has the final say through the confirm/reject flow.

**Q: Why attach the original photo?**
A: Audit trail. If inventory numbers do not match physical stock, the retailer or their accountant can pull up the original bill photo tied to each draft purchase. The SHA-256 hash proves the photo was not altered after capture.

**Q: Why not merge this with the existing payment OCR pipeline?**
A: Payment OCR (`F-OCR-001`) and bill OCR serve fundamentally different purposes. Payment OCR verifies a real-time transaction against an open order -- it needs fraud detection, freshness checks, and duplicate prevention. Bill OCR parses a supplier delivery note into inventory line items -- it needs fuzzy product matching and a draft review lifecycle. The prompts, validation logic, data models, and user flows are entirely different. Keeping them separate avoids coupling two complex features that evolve independently.
