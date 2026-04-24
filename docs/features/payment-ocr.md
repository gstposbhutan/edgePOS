# Feature: mBoB/BNB Payment OCR Verification

**Feature ID**: F-OCR-001
**Phase**: 3
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

When a customer pays via mBoB or BNB mobile banking, they present their phone screen showing the transaction confirmation to the cashier. The POS front-facing camera captures a photo of the screen and an OCR pipeline extracts structured payment data. The extracted Journal Number, amount, sender name, date/time, and account digits are verified against the open order. This replaces manual reference-number entry and catches common payment fraud before the order is confirmed.

---

## User Flow

```
Cashier selects "mBoB" or "BNB" as payment method on POS
  → PaymentScannerModal opens with live camera feed
  → Customer holds phone showing payment success screen toward camera
  → Cashier taps "Capture"
  → Image is sent to /api/payment-verify
  → Server preprocesses image, calls vision AI, returns structured result
  → On success:
      payment_ref auto-filled with Journal Number
      captured image stored as proof
      order marked payment verified
      cashier taps "Confirm Order"
  → On failure:
      failure reason displayed (unreadable, amount mismatch, no journal number)
      cashier can: retake photo, manually enter Journal Number, or cancel
```

---

## Supported Payment Apps

### mBoB (Bank of Bhutan)

| Field | Extraction Target |
|-------|-------------------|
| Screen | Green success confirmation screen |
| Journal Number | Format: `TXN` followed by digits (e.g. `TXN20260419123456`) |
| Amount | Displayed as `Nu. X,XXX.XX` with Ngultrum symbol |
| Sender Name | Account holder name |
| Date/Time | Transaction timestamp |
| Account | Last 4 digits of debited account |

### BNB (Bhutan National Bank) Mobile Banking

| Field | Extraction Target |
|-------|-------------------|
| Screen | BNB success confirmation screen (different layout from mBoB) |
| Reference Number | BNB-specific format (differs from mBoB `TXN` prefix) |
| Amount | Displayed in Ngultrum format |
| Sender Name | Account holder name |
| Date/Time | Transaction timestamp |
| Account | Last 4 digits of debited account |

The vision AI prompt must distinguish between the two apps and apply the correct field parsing logic for each.

---

## OCR Pipeline

```
Camera Capture (webcam / phone camera)
  → Image Preprocessing
      - Contrast enhancement (histogram equalization)
      - Auto-rotation correction (EXIF orientation + deskew)
      - Crop to detected screen region (optional, reduces noise)
  → Vision AI API Call
      - Primary: Zhipu GLM-4V-Flash (via existing /api/payment-verify route)
      - Fallback: Gemini 1.5 Flash Vision (auto-fallback already implemented)
  → Structured Extraction
      - Journal Number (string)
      - Amount (decimal, stripped of currency symbols)
      - Sender Name (string)
      - Date/Time (parsed to ISO 8601)
      - Account last 4 digits (string)
      - Payment app detected: "MBOB" | "BNB" | "UNKNOWN"
  → Validation & Fraud Checks (see below)
  → Return result to client
```

---

## Fraud Detection

Every OCR result passes through these checks before `verified: true` is returned.

### 1. Amount Match
- OCR-extracted amount must match the order `grand_total`
- Tolerance: plus or minus Nu. 1.00 (rounding allowance)
- If outside tolerance: `verified: false`, reason `AMOUNT_MISMATCH`

### 2. Duplicate Journal Number
- Journal Number is checked against all previous `payment_attempts` records for the store
- If the same Journal Number was already used on a different order: `verified: false`, reason `DUPLICATE_REF`
- Prevents re-use of old screenshots

### 3. Timestamp Freshness
- OCR-extracted date/time is compared to server current time
- If more than 10 minutes old: `verified: false`, reason `STALE_TRANSACTION`
- Prevents use of screenshots from previous transactions

### 4. Screen Integrity
- Vision AI is instructed to detect if the image shows an actual phone screen vs. a printed copy, second phone displaying a photo, or screen recording
- Confidence threshold: minimum 0.70 (already enforced)
- If screen tampering suspected: `verified: false`, reason `SUSPECTED_TAMPERING`

---

## Failure Handling

### Cashier-Facing Failure Reasons

| Reason Code | Display Message | Available Actions |
|-------------|----------------|-------------------|
| `UNREADABLE` | "Could not read the payment screen. Ensure the screen is well-lit and clearly visible." | Retake, Manual Entry |
| `AMOUNT_MISMATCH` | "Amount found: Nu. X — Expected: Nu. Y" | Retake, Manual Entry, Cancel |
| `MISSING_REF` | "No Journal Number found on the screenshot." | Retake, Manual Entry |
| `DUPLICATE_REF` | "This Journal Number was already used on another order." | Cancel only |
| `STALE_TRANSACTION` | "Transaction is more than 10 minutes old." | Retake, Cancel |
| `SUSPECTED_TAMPERING` | "Screen may be a copy or recording. Manual verification recommended." | Manual Entry, Cancel |
| `WRONG_APP` | "Screenshot is from a different payment app than selected." | Retake, Switch payment method |

### Manual Journal Number Entry
When OCR fails, the cashier is presented with a text input to manually type the Journal Number from the customer's phone screen. Manual entries are flagged in `payment_attempts` with `gateway: 'MANUAL'` and require the same fraud checks (duplicate, timestamp).

### Retry Limits
Maximum 3 OCR capture attempts per order (already enforced by `MAX_ATTEMPTS = 3` in `PaymentScannerModal`). After 3 failed attempts, the modal closes and the cashier must choose a different payment method or escalate to manager.

---

## Platform Support

| Platform | Camera Source | Behavior |
|----------|--------------|----------|
| Desktop POS (4K) | Front-facing USB webcam | High-resolution capture, ideal conditions |
| PWA (mobile) | Phone rear camera | Cashier uses their phone to scan customer's screen |
| Tablet | Front or rear camera | Same flow, responsive layout adapts |

Both platforms hit the same `/api/payment-verify` endpoint. The client-side `captureFrame()` function in `lib/vision/payment-ocr.js` handles video-to-image conversion regardless of device.

---

## Modified Files

This feature extends existing code. No new files are created; no files are rebuilt from scratch.

### `app/api/payment-verify/route.js` (extend)

Current state: Accepts image + expectedAmount, returns `{ verified, extractedAmount, referenceNo, confidence, reason }`.

Extensions needed:
- Expand the `PROMPT` to request: sender name, date/time, account last 4, payment app detection
- Add server-side fraud checks after parsing: amount tolerance check, duplicate reference query against `payment_attempts`, timestamp freshness check
- Accept optional `paymentMethod` param ("MBOB" | "BNB") so the prompt can include app-specific parsing instructions
- Return new fields: `senderName`, `transactionDate`, `accountLast4`, `detectedApp`, `fraudFlags[]`
- Store the captured image (base64) in a `payment_proof` table or Supabase Storage bucket for audit

### `components/pos/payment-scanner-modal.jsx` (extend)

Current state: Camera modal with capture, verify, success/failed phases.

Extensions needed:
- Pass `paymentMethod` prop to `verifyPaymentScreenshot()` so the API knows which app to parse
- On failed OCR: show the specific failure reason from the table above, show manual Journal Number input field, show "Switch Payment Method" button
- On success: display extracted sender name and account last 4 for cashier visual confirmation
- Add fraud flag warnings (yellow banner) when `fraudFlags` array is non-empty but verification still passed

### `lib/vision/payment-ocr.js` (extend)

Current state: `captureFrame()` and `verifyPaymentScreenshot()` helpers.

Extensions needed:
- `verifyPaymentScreenshot()` accepts new `paymentMethod` parameter, passes it to the API
- Return type expanded with `senderName`, `transactionDate`, `accountLast4`, `detectedApp`, `fraudFlags`

---

## Database Changes

### `payment_attempts` table (existing, no schema change)

The `gateway_ref` column stores the Journal Number. The `gateway_response` JSONB column stores the full OCR result including:
```json
{
  "ocr_verify_id": "OCR-ZHIPU-1745068800000-A3F2K1",
  "extracted_amount": 1250.00,
  "reference_no": "TXN20260419123456",
  "sender_name": "Tenzin Dorji",
  "transaction_date": "2026-04-19T14:30:00+06:00",
  "account_last_4": "4521",
  "detected_app": "MBOB",
  "confidence": 0.92,
  "fraud_flags": [],
  "provider": "zhipu",
  "image_stored_at": "supabase-storage://payment-proofs/2026/04/19/OCR-ZHIPU-xxx.jpg"
}
```

### `payment_proofs` table (new)

Stores captured payment screenshots for audit and dispute resolution.

```sql
CREATE TABLE payment_proofs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id),
  image_path      TEXT NOT NULL,          -- Supabase Storage path
  image_hash      TEXT NOT NULL,          -- SHA-256 of image bytes (tamper evidence)
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `orders` table (existing, no schema change)

- `payment_ref`: populated with Journal Number from OCR or manual entry
- `ocr_verify_id`: populated with the verification ID from successful OCR
- `payment_verified_at`: timestamp when verification passed

---

## Vision AI Prompt Design

The prompt sent to the vision API must be expanded to handle app-specific parsing. The key addition is app-aware field extraction:

```
You are a payment verification assistant for a Bhutan POS system (NEXUS BHUTAN).

The cashier selected "{paymentMethod}" as the payment method.
Analyze this payment confirmation screenshot and extract:

1. Which payment app generated this screen: "MBOB" (Bank of Bhutan mBoB),
   "BNB" (Bhutan National Bank), or "UNKNOWN"
2. Transaction amount (numeric value only, no currency symbols)
3. Journal Number / Reference Number:
   - mBoB format: "TXN" followed by digits
   - BNB format: different prefix pattern
4. Sender name (account holder who sent the payment)
5. Transaction date and time (ISO 8601 if possible)
6. Last 4 digits of the sender's account
7. Transaction status: SUCCESS, FAILED, PENDING
8. Whether the amount matches the expected amount of Nu. {expectedAmount}
   (allow plus or minus Nu. 1.00 for rounding)
9. Whether the image appears to be a genuine phone screen (not a printed copy
   or photo of a photo)

Respond ONLY with valid JSON, no markdown:
{
  "detectedApp": "MBOB" | "BNB" | "UNKNOWN",
  "status": "SUCCESS" | "FAILED" | "PENDING" | "UNREADABLE",
  "extractedAmount": <number or null>,
  "referenceNo": "<string or null>",
  "senderName": "<string or null>",
  "transactionDate": "<ISO 8601 string or null>",
  "accountLast4": "<string or null>",
  "amountMatches": <true | false>,
  "screenGenuine": <true | false>,
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation>"
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Customer shows mBoB screen but cashier selected BNB | API returns `detectedApp: "MBOB"`, front-end shows "Wrong app detected" warning, offers to switch payment method |
| Partially obscured Journal Number | OCR returns `referenceNo: null`, classified as `MISSING_REF`, manual entry offered |
| Customer shows screenshot from yesterday | Timestamp check fails, `STALE_TRANSACTION` returned |
| Same customer pays twice for two different orders | Each order gets a unique Journal Number; if duplicate detected, second verification fails with `DUPLICATE_REF` |
| Blurry photo | Low confidence (< 0.70), classified as `UNREADABLE`, retake offered |
| Customer uses mPay instead of mBoB | mPay is a separate payment method already supported; this spec covers mBoB and BNB only |
| Camera not available | Existing behavior: `Camera access denied` message, modal shows failed state |
| Vision API down (both Zhipu and Gemini) | Returns 500 error, manual Journal Number entry is the fallback path |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Image preprocessing | < 200ms |
| Vision AI round-trip | < 3 seconds |
| Server-side fraud checks | < 100ms |
| Total capture-to-result | < 4 seconds |
| OCR accuracy on clear screenshots | > 95% |
| OCR accuracy on angled/poor lighting | > 80% |

---

## Implementation Checklist

### Server-Side (`app/api/payment-verify/route.js`)
- [ ] Expand vision AI prompt with app-specific parsing for mBoB and BNB
- [ ] Accept `paymentMethod` parameter in request body
- [ ] Parse new response fields: `senderName`, `transactionDate`, `accountLast4`, `detectedApp`, `screenGenuine`
- [ ] Implement amount tolerance check (plus or minus Nu. 1.00)
- [ ] Implement duplicate Journal Number check against `payment_attempts` table
- [ ] Implement timestamp freshness check (10-minute window)
- [ ] Implement screen tampering flag from `screenGenuine` field
- [ ] Return `fraudFlags` array in response
- [ ] Store captured image to Supabase Storage on successful verification
- [ ] Return new fields in response JSON

### Client-Side (`components/pos/payment-scanner-modal.jsx`)
- [ ] Pass `paymentMethod` prop through to `verifyPaymentScreenshot()`
- [ ] Display specific failure reasons from the failure-reason table
- [ ] Add manual Journal Number input field on OCR failure
- [ ] Add "Switch Payment Method" button on `WRONG_APP` detection
- [ ] Display extracted sender name and account last 4 on success
- [ ] Show fraud-flag warnings as yellow banner when flags present
- [ ] Maintain existing retry limit (3 attempts) and camera management

### Client-Side (`lib/vision/payment-ocr.js`)
- [ ] `verifyPaymentScreenshot()` accepts `paymentMethod` parameter
- [ ] Pass `paymentMethod` to `/api/payment-verify` request body
- [ ] Return expanded result type with `senderName`, `transactionDate`, `accountLast4`, `detectedApp`, `fraudFlags`

### Database
- [ ] Create `payment_proofs` table
- [ ] Add query function: check duplicate Journal Number by `entity_id` + `gateway_ref`
- [ ] Add Supabase Storage bucket for payment proof images

### Testing
- [ ] Unit tests: amount tolerance logic (exact match, plus 1, minus 1, over tolerance)
- [ ] Unit tests: timestamp freshness logic (1 min ago, 9 min ago, 11 min ago)
- [ ] Unit tests: duplicate reference detection
- [ ] Integration tests: full OCR pipeline with sample mBoB screenshot
- [ ] Integration tests: full OCR pipeline with sample BNB screenshot
- [ ] Edge case tests: wrong app, blurry image, missing fields, API failure

---

## Resolved Decisions

**Q: Why OCR instead of direct mBoB/BNB API integration?**
A: Direct banking API integration (mBoB Merchant API, mPay Payment Gateway) is the long-term goal and is listed as a Phase 4 high-priority integration. However, these APIs are not yet publicly available or documented for third-party POS integration in Bhutan. OCR verification via camera is the practical bridge solution that works today without waiting for banking partner APIs. The OCR pipeline is designed to be replaced by direct API calls when those become available -- the fraud checks and payment_attempts logging remain identical.

**Q: Why store the captured image as proof?**
A: Audit trail requirement. If a customer disputes a charge or if there is a reconciliation discrepancy, the original screenshot must be available for review. The image hash (`payment_proofs.image_hash`) ensures the proof was not tampered with after capture.

**Q: Why allow manual Journal Number entry when OCR fails?**
A: Practical fallback. Camera quality, lighting, and screen glare can cause OCR failures even on legitimate payments. Manual entry with the same fraud checks (duplicate detection, timestamp) provides a safety net without blocking the checkout flow. Manual entries are flagged in the audit log so managers can review them.

**Q: Why 10-minute freshness window?**
A: Balances fraud prevention with real-world conditions. A customer who completed payment while walking to the counter should not be blocked. 10 minutes accounts for transit time from payment to presentation while catching screenshots from hours or days ago.

**Q: Why extend existing files instead of creating new ones?**
A: The existing `payment-scanner-modal.jsx`, `payment-ocr.js`, and `/api/payment-verify/route.js` already implement the camera capture, vision API call, and result parsing. The extensions are additive (new prompt fields, fraud checks, manual entry UI) and do not require architectural changes. Keeping the code in the same files maintains a single source of truth for payment verification logic.
