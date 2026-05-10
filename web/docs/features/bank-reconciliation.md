# Feature: Bank Statement Parser & Auto-Match

**Feature ID**: F-BANK-001
**Phase**: 3
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Desktop-only reconciliation tool that lets an owner upload a PDF or photo of their daily/weekly bank statement (mBoB or BNB), OCR-parses every transaction row, and auto-matches each bank entry to system orders. The goal is a single-screen reconciliation dashboard that answers three questions at end-of-day: *Which bills have money in the bank? Which bills are missing? Which bank credits have no matching bill?*

---

## Platform Scope

This is a **desktop-only** feature. File upload, OCR batch processing, and the reconciliation dashboard are built for the POS Terminal desktop app. The PWA/mobile app may view reconciliation results in a read-only summary, but all upload and matching operations require desktop.

**Rationale**: Bank statement files are large, batch OCR is compute-intensive, and reconciliation requires side-by-side comparison of many rows — a workflow that needs a wide screen and file system access.

---

## Supported Bank Statement Formats

### mBoB (Mobile Bank of Bhutan)

Tabular layout with the following columns:

| Column | Description |
|--------|-------------|
| Date | Transaction date (DD/MM/YYYY or DD-Mon-YYYY) |
| Narration | Description containing the Journal Number, payer name, and reference details |
| Withdrawal (Nu.) | Debit amount |
| Deposit (Nu.) | Credit amount |
| Balance (Nu.) | Running account balance |

**Journal Number location**: Embedded within the Narration column, typically formatted as `JNL-XXXXXXXX` or a numeric sequence. The OCR parser must extract this using regex patterns specific to mBoB's narration format.

### BNB (Bank of Bhutan National)

Similar tabular layout with different column headers:

| Column | Description |
|--------|-------------|
| Tran Date | Transaction date |
| Particulars | Description / payer details |
| Debit (Nu.) | Debit amount |
| Credit (Nu.) | Credit amount |
| Balance (Nu.) | Running balance |

**Journal Number location**: Appears in the Particulars column. Format may differ from mBoB. Parser must detect bank type automatically or allow manual selection.

---

## OCR Pipeline

The pipeline reuses the same Gemini Vision infrastructure built for `F-OCR-001` (payment screenshot verification). Statement parsing is a new prompt template on the same API path.

### Flow

```
Owner uploads bank statement file (PDF or image)
  → If PDF:
      → Convert each page to a high-res PNG (pdf-to-image library)
      → Process each page image independently
  → If image (JPG/PNG):
      → Use directly
  → For each image:
      → Send to Gemini Vision API with bank-statement-specific prompt
      → Gemini returns structured JSON: array of transaction rows
  → Merge all page results into a single ordered list
  → Store parsed results in bank_statement_rows table
  → Trigger auto-match engine
```

### Gemini Vision Prompt Requirements

The prompt must instruct Gemini to:
1. Identify the bank (mBoB or BNB) from the statement header/logo
2. Parse every transaction row into structured fields
3. Extract the Journal Number from the narration/particulars column
4. Distinguish between credits (deposits) and debits (withdrawals)
5. Return results as a JSON array with schema: `{ date, narration, journal_no, amount, type: CREDIT|DEBIT, balance }`
6. Handle multi-page statements by returning rows in chronological order

### Parsed Row Schema

Each row extracted from the statement is stored as:

```
{
  date: Date,              // Parsed transaction date
  narration: String,       // Full narration text from statement
  journal_no: String|null, // Extracted Journal Number (null if not found)
  amount: Decimal,         // Transaction amount (always positive)
  type: CREDIT | DEBIT,    // Credit = money in, Debit = money out
  balance: Decimal|null,   // Running balance if available
  page_number: Int,        // Source page in multi-page PDF
  row_index: Int           // Row position on the page (for ordering)
}
```

---

## Database Schema

### `bank_statements` table

Tracks each uploaded statement file.

```sql
CREATE TABLE bank_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  bank_name       TEXT NOT NULL CHECK (bank_name IN ('MBOB', 'BNB')),
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL CHECK (file_type IN ('PDF', 'JPG', 'PNG', 'JPEG')),
  file_size_bytes BIGINT,
  statement_date  DATE,                     -- Date range covered (start)
  statement_end   DATE,                     -- Date range covered (end)
  total_credits   DECIMAL(12,2),            -- Sum of all deposits parsed
  total_debits    DECIMAL(12,2),            -- Sum of all withdrawals parsed
  rows_parsed     INT DEFAULT 0,
  rows_matched    INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'UPLOADED'
                  CHECK (status IN ('UPLOADED', 'PROCESSING', 'PARSED', 'MATCHED', 'FAILED')),
  error_message   TEXT,
  uploaded_by     UUID NOT NULL REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);
```

### `bank_statement_rows` table

Individual transaction rows extracted from OCR.

```sql
CREATE TABLE bank_statement_rows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id),
  row_date        DATE NOT NULL,
  narration       TEXT,
  journal_no      TEXT,                      -- Extracted from narration
  amount          DECIMAL(12,2) NOT NULL,
  row_type        TEXT NOT NULL CHECK (row_type IN ('CREDIT', 'DEBIT')),
  balance         DECIMAL(12,2),
  page_number     INT DEFAULT 1,
  row_index       INT NOT NULL,
  match_status    TEXT NOT NULL DEFAULT 'UNMATCHED'
                  CHECK (match_status IN ('MATCHED', 'UNMATCHED', 'DISMISSED', 'MANUALLY_LINKED')),
  matched_order_id UUID REFERENCES orders(id),
  dismissed_at    TIMESTAMPTZ,
  dismissed_by    UUID REFERENCES user_profiles(id),
  dismissed_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Additions to `orders` table

```sql
ALTER TABLE orders ADD COLUMN bank_reconciled  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN reconciled_at    TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN reconciled_by    UUID REFERENCES user_profiles(id);
ALTER TABLE orders ADD COLUMN matched_row_id   UUID REFERENCES bank_statement_rows(id);
```

---

## Auto-Match Engine

### Match Criteria

For each parsed bank entry of type `CREDIT`, the engine searches the `orders` table:

1. **Primary match** (strong confidence):
   - `bank_statement_rows.journal_no` = `orders.payment_ref` (exact match, case-insensitive, trimmed)
   - AND `bank_statement_rows.amount` is within +/- Nu. 1 of `orders.grand_total`
   - AND `orders.seller_id` = current entity
   - AND `orders.bank_reconciled` = FALSE

2. **Amount-only match** (weak confidence, flagged for manual review):
   - `bank_statement_rows.amount` is within +/- Nu. 1 of `orders.grand_total`
   - AND `bank_statement_rows.row_date` is within 3 days of `orders.created_at`
   - AND `orders.payment_method` IN ('MBOB', 'MPAY', 'RTGS')
   - AND no Journal Number match found
   - These appear as **yellow (amount mismatch / low confidence)** in the dashboard

### Match Flow

```
Auto-match engine runs after OCR parsing completes
  → For each bank_statement_row where row_type = CREDIT and match_status = UNMATCHED:
      → If journal_no is not null:
          → Search orders WHERE payment_ref ILIKE journal_no
              AND seller_id = entity_id
              AND bank_reconciled = FALSE
              AND ABS(grand_total - amount) <= 1.00
          → If exactly 1 match found:
              → Mark bank_statement_row.match_status = MATCHED
              → Mark bank_statement_row.matched_order_id = order.id
              → Mark order.bank_reconciled = TRUE
              → Set order.reconciled_at = NOW()
          → If multiple matches found:
              → Flag as AMBIGUOUS (manual review needed)
          → If no matches:
              → Remain UNMATCHED
      → If journal_no is null:
          → Attempt amount-only match with date window
          → If found, mark as weak match (requires manual confirmation)
  → Update bank_statements.rows_matched count
  → Update bank_statements.status = MATCHED
  → Trigger WhatsApp end-of-day summary
```

### Match Prevention

- An order can only be matched to ONE bank row. Once `bank_reconciled = TRUE`, it is excluded from future matching.
- A bank row can only be matched to ONE order. Once `match_status = MATCHED`, it is excluded from future matching.
- Duplicate statement uploads are detected by checking `bank_statements.statement_date` + `entity_id` + `bank_name` — owner is warned before re-processing.

---

## Reconciliation Dashboard

### Color Coding

| Color | Status | Meaning |
|-------|--------|---------|
| Green | Matched | Bank entry matched to an order. Money verified in bank. |
| Yellow | Unmatched Order | Order exists (MBOB/MPAY/RTGS payment) but no matching bank entry found. Potential fraud, delayed settlement, or OCR failure. |
| Blue | Unmatched Bank Entry | Money received in bank but no matching order. Could be personal transfer, salary credit, or cash deposit. |
| Red | Amount Mismatch | Journal Number matches an order but amount differs by more than Nu. 1. Suspect partial payment or wrong order linked. |

### Dashboard Layout

```
+-------------------------------------------------------------------+
| BANK RECONCILIATION                               [Upload Statement]|
| Statement: mBoB | Date: 19-Apr-2026 | 47 rows parsed              |
|-------------------------------------------------------------------|
| Summary: 32 matched | 4 unmatched orders | 8 unmatched entries    |
|          3 amount mismatches                                         |
|-------------------------------------------------------------------|
| [All] [Matched] [Unmatched Orders] [Unmatched Bank] [Mismatches]   |
|-------------------------------------------------------------------|
| Date       | Narration          | Journal | Amount | Order    | St  |
|------------|--------------------|---------|--------|----------|-----|
| 19-Apr     | NEFT-ShopEasy      | JNL-421 | 1,200  | POS-142  | Grn |
| 19-Apr     | Salary-April       | —       | 15,000 | —        | Blu |
| 19-Apr     | mBoB-Transfer      | JNL-422 | 850    | POS-139  | Red |
| 19-Apr     | (no bank entry)    | —       | —      | POS-143  | Ylw |
+-------------------------------------------------------------------+
```

### Manual Actions

- **Dismiss unmatched bank entry**: Owner clicks a blue row, selects "Dismiss" with a reason (Personal Transfer / Salary / Cash Deposit / Other). Row is marked `DISMISSED`.
- **Manually link bank entry to order**: Owner clicks a blue row, selects "Link to Order", searches by order number or customer name, and creates the link. Row is marked `MANUALLY_LINKED`, order is marked `bank_reconciled = TRUE`.
- **Investigate unmatched order**: Owner clicks a yellow row to view the order detail. Possible actions: re-check bank statement, mark as "Cash Collected", or flag for investigation.

---

## WhatsApp End-of-Day Summary

After reconciliation completes (or at a scheduled time each evening), a WhatsApp summary is sent to the store owner.

### Message Template

```
*Bank Reconciliation — 19 Apr 2026*
Statement: mBoB

*Bills:* 32 totaling Nu. 45,200
*Matched in bank:* 28 (Nu. 39,600)
*Unmatched:* 4 (Nu. 5,600)

_Unmatched orders need attention._
Open POS Desktop to review.
```

### Trigger Conditions

- Automatically sent when a statement is fully processed and matched.
- Also sent via scheduled job at 8:00 PM if any orders from today remain `bank_reconciled = FALSE` and payment_method is not CASH.
- Sent only to the Owner's WhatsApp number (from `entities.whatsapp_no` or `user_profiles`).

---

## API Routes

### Desktop POS API (Hono.js on Bun)

```
POST /local/reconciliation/upload
  → Accepts multipart file upload (PDF or image)
  → Creates bank_statements record
  → Triggers OCR pipeline
  → Returns bank_statement_id for polling

GET /local/reconciliation/status/:statement_id
  → Returns processing status + progress

GET /local/reconciliation/dashboard/:statement_id
  → Returns full reconciliation results with color-coded match status
  → Query params: filter (all|matched|unmatched_order|unmatched_bank|mismatch)

POST /local/reconciliation/dismiss/:row_id
  → Marks a bank row as DISMISSED with reason

POST /local/reconciliation/link
  → Body: { row_id, order_id }
  → Manually links a bank row to an order

GET /local/reconciliation/unmatched-orders
  → Returns orders for the statement period that are bank_reconciled = FALSE
  → Used for manual linking search
```

---

## Security & Access Control

| Action | Cashier | Manager | Owner |
|--------|---------|---------|-------|
| Upload bank statement | No | Yes | Yes |
| View reconciliation dashboard | No | Yes | Yes |
| Dismiss unmatched bank entry | No | No | Yes |
| Manually link bank entry to order | No | Yes | Yes |
| View WhatsApp summary | No | No | Yes |

Row-Level Security: `bank_statements` and `bank_statement_rows` are filtered by `entity_id` matching the user's store. No cross-store visibility.

---

## Error Handling

### OCR Failures

| Scenario | Handling |
|----------|----------|
| Unreadable PDF (corrupt, encrypted) | Return error with message. Owner must download a fresh copy from bank app. |
| Gemini API timeout | Retry up to 2 times. If still failing, mark statement as FAILED with error detail. |
| Partial page parse | Process whatever rows are extractable. Log warning for failed pages. Owner can re-upload those pages separately. |
| Bank format not recognized | Prompt owner to manually select bank (mBoB / BNB / Other) and re-process. |

### Match Failures

| Scenario | Handling |
|----------|----------|
| Journal Number in narration but not extracted | Owner can manually enter the Journal Number on the bank row to trigger re-match. |
| Multiple orders with same payment_ref | Flag as ambiguous. Owner picks the correct match from a list. |
| Order paid in cash but marked as MBOB | Cashier error. Owner corrects payment_method on the order, which removes it from unmatched. |

---

## Dependencies

- **F-OCR-001**: Uses the same Gemini Vision API pipeline for OCR processing. The statement parsing prompt is a new template on the shared infrastructure.
- **F-ORDER-001**: Reads from `orders` table for matching. Requires `payment_ref` to be populated during payment verification.
- **WhatsApp Gateway**: Requires the `whatsapp-gateway` microservice to be operational for end-of-day summary delivery.

---

## Implementation Checklist

### Database
- [ ] Create `bank_statements` table
- [ ] Create `bank_statement_rows` table
- [ ] Add `bank_reconciled`, `reconciled_at`, `reconciled_by`, `matched_row_id` columns to `orders` table
- [ ] DB index on `bank_statement_rows(journal_no)` for fast match lookups
- [ ] DB index on `orders(payment_ref)` for fast match lookups
- [ ] DB constraint: each order can only be matched once (`bank_reconciled` check)
- [ ] DB constraint: each bank row can only be matched once (`match_status` check)
- [ ] RLS policies on `bank_statements` and `bank_statement_rows` filtered by `entity_id`

### OCR Pipeline
- [ ] PDF-to-image conversion utility (multi-page support)
- [ ] Gemini Vision prompt template for mBoB statement parsing
- [ ] Gemini Vision prompt template for BNB statement parsing
- [ ] Auto-detect bank type from statement header
- [ ] Parsed row validation (date format, amount range, required fields)
- [ ] Multi-page merge and chronological ordering
- [ ] Duplicate statement detection (same date range + bank + entity)

### Auto-Match Engine
- [ ] Primary match: Journal Number + amount tolerance (+/- Nu. 1)
- [ ] Secondary match: amount-only with date window (3 days)
- [ ] Ambiguous match detection (multiple candidates)
- [ ] Match execution: update `bank_statement_rows` and `orders` in single transaction
- [ ] Re-match support: allow re-running match after manual Journal Number entry

### Reconciliation Dashboard (Desktop)
- [ ] File upload component (drag-and-drop + file picker)
- [ ] Processing status indicator with progress bar
- [ ] Summary bar (matched / unmatched orders / unmatched bank / mismatches)
- [ ] Filterable results table with color-coded rows
- [ ] Dismiss action for unmatched bank entries (with reason dropdown)
- [ ] Manual link action (search order by order number or customer)
- [ ] Order detail drawer for investigating unmatched orders
- [ ] Export reconciliation results as CSV

### WhatsApp Integration
- [ ] End-of-day summary message template
- [ ] Trigger on reconciliation completion
- [ ] Scheduled 8:00 PM job for unresolved orders
- [ ] Sent only to Owner role

### API Routes
- [ ] `POST /local/reconciliation/upload` — file upload + OCR trigger
- [ ] `GET /local/reconciliation/status/:statement_id` — polling endpoint
- [ ] `GET /local/reconciliation/dashboard/:statement_id` — results with filters
- [ ] `POST /local/reconciliation/dismiss/:row_id` — dismiss bank entry
- [ ] `POST /local/reconciliation/link` — manual link
- [ ] `GET /local/reconciliation/unmatched-orders` — search for manual linking

---

## Resolved Decisions

**Q: Why desktop-only and not available on PWA/mobile?**
A: Bank statement reconciliation is a batch operation involving file uploads (often multi-page PDFs), OCR processing of many rows, and a side-by-side comparison UI. This workflow is poorly suited to small screens and mobile browsers. Mobile users can view a read-only reconciliation summary in a future iteration.

**Q: Why +/- Nu. 1 tolerance on amount matching instead of exact match?**
A: Bhutanese banks occasionally round differently at the paisa level. A Nu. 1 tolerance catches these cases without creating false positives. Amounts differing by more than Nu. 1 are flagged as red (mismatch) for manual investigation.

**Q: What happens if the owner uploads the same statement twice?**
A: The system detects duplicates by checking `statement_date` + `statement_end` + `bank_name` + `entity_id`. If a duplicate is detected, the owner is warned and must confirm re-upload. Previous matches are not overwritten — the new upload creates a fresh statement record and re-runs matching against only unmatched orders.

**Q: Should debits (withdrawals) from the bank statement be matched?**
A: Not in v1. The auto-match engine only processes CREDIT rows (money received). Debit rows are parsed and stored but not matched — they are visible in the dashboard for the owner's reference. Future iterations may match debits to supplier payments or expense records.

**Q: How are cash orders handled in reconciliation?**
A: Cash orders (`payment_method = CASH`) are excluded from reconciliation entirely. They never appear as "unmatched" because cash never appears in the bank statement. Only MBOB, MPAY, and RTGS orders participate in matching.
