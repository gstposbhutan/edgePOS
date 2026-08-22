# CREDIT Checkout WhatsApp OTP — E2E Implementation Plan

## Problem

The CREDIT payment checkout requires WhatsApp OTP verification (`CustomerOtpModal`), but the e2e tests bypass this flow by going through `CustomerIdModal` only. This means:

1. The credit limit check in `handleCreditOtpVerified` never fires in tests
2. The khata account lookup via `lookupAccount` is skipped
3. The order hits the DB trigger `khata_debit_on_confirm` which throws "No active khata account found for credit sale"

Current test stopgap: renamed to "credit sale without khata account shows error" and checks the DB trigger error banner appears.

## Architecture: Production CREDIT Flow

```
Select CREDIT → handleCheckout()
  → customer?.whatsapp? YES → setShowCreditOtp(true)
  → CustomerOtpModal opens
    → Step 1: Enter phone → POST /api/auth/whatsapp/send
    → Step 2: Enter OTP  → POST /api/auth/whatsapp/verify
    → onVerified(phone) → handleCreditOtpVerified(phone)
      → setCustomerIdentity(phone)
      → lookupAccount(phone) — find khata
      → if no account: createAccount(phone)
      → credit limit check: balance + grandTotal > limit?
      → initiateCheckout() → processCheckout()
```

## Architecture: Bypassed Path (current e2e)

```
Select CREDIT → handleCheckout()
  → customer?.whatsapp? NO → setShowCustomerModal(true)
  → CustomerIdModal opens → enter phone → confirm
  → handleCustomerIdentified(phone)
    → setCustomerIdentity(phone)
    → lookupAccount(phone) — finds nothing
    → setKhataAccount(null)  ← NO credit limit check
    → initiateCheckout() → processCheckout()
    → API creates order → DB trigger fails
```

## Implementation Steps

### 1. Create `CustomerOtpModal` Page Object

File: `e2e/page-objects/customer-otp-modal.js`

Locators:
- Dialog: `[role="dialog"]` with title "Verify Customer Identity"
- Phone input: `input[type="tel"]` (step: 'phone')
- Send OTP button: `getByRole('button', { name: /Send OTP/i })`
- OTP digit inputs: `input[type="text"].text-center` (6 boxes, step: 'otp')
- Verify button: `getByRole('button', { name: /Verify/i })`
- Error text: `p.text-tibetan`

Methods:
- `assertOpen()` — wait for dialog visible
- `enterPhone(phone)` — fill phone input
- `clickSendOtp()` — click send button
- `enterOtp(otp)` — fill 6-digit OTP (paste or type each box)
- `clickVerify()` — click verify button
- `fillAndVerify(phone, otp)` — convenience: enter phone + send + enter OTP + verify

### 2. Export from `v2-helpers.js`

Add `CustomerOtpModal` to the exports.

### 3. Fix `v2h-error-handling.spec.js` Credit Test

Mock both OTP endpoints via Playwright `page.route()`:

```js
// Mock OTP send — returns mock OTP in response
await page.route('**/api/auth/whatsapp/send', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, mock: true, otp: '123456' }),
  })
})

// Mock OTP verify — accepts any OTP
await page.route('**/api/auth/whatsapp/verify', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  })
})
```

Test flow:
1. Add expensive product (IN_STOCK_PRODUCT, Nu. 35000)
2. Select CREDIT, click checkout
3. CustomerIdModal → enter KHATA_ACCOUNT.debtor_phone (+97517100011)
4. CustomerOtpModal → enter phone + OTP → verify
5. `handleCreditOtpVerified` runs → khata lookup succeeds → credit limit check: 500 + 35000 > 5000 → error
6. Assert error banner with "limit exceeded"

### 4. Add Passing Credit Checkout Test

With CHEAP_PRODUCT (Nu. 60) and KHATA_ACCOUNT (limit 5000, outstanding 500):
- 500 + 60 = 560 < 5000 → checkout succeeds
- Navigate to receipt page

### 5. Verify Khata Seed Data

The e2e setup already seeds khata accounts (`e2e/fixtures/db-seed.js` line 173-175):

```js
const { error: khataErr } = await supabase
  .from('khata_accounts')
  .upsert(TEST_KHATA_ACCOUNTS, { onConflict: 'id' })
```

`TEST_KHATA_ACCOUNTS[0]` (used in tests):
- `debtor_phone`: `+97517100011`
- `credit_limit`: 5000.00
- `outstanding_balance`: 500.00
- `status`: ACTIVE
- `creditor_entity_id`: TEST_ENTITY.id (Dawai Tshongkhang)

## Files to Create/Modify

| File | Action |
|------|--------|
| `e2e/page-objects/customer-otp-modal.js` | **Create** |
| `e2e/specs/v2-helpers.js` | Add `CustomerOtpModal` export |
| `e2e/specs/v2h-error-handling.spec.js` | Fix credit test + add passing test |

## Key Decisions

- **Playwright route mocks**: Intercept OTP endpoints at browser level. Does NOT depend on `MOCK_WHATSAPP=true` env var. Each test controls its own mock responses.
- **Two-step modal flow**: CustomerIdModal first (if no customer), then CustomerOtpModal. Both handled in tests.
- **Khata data already seeded**: No seed changes needed. `db-seed.js` upserts `TEST_KHATA_ACCOUNTS` on every test run.

## Verification

1. `npx playwright test e2e/specs/v2h-error-handling.spec.js --reporter=list`
2. "credit sale without khata account" → shows "limit exceeded" (not "No active khata account")
3. "CREDIT checkout with valid khata account" → navigates to receipt page
4. "DB insert failure shows error banner" → still passes
5. Full suite: `npx playwright test --reporter=list` — no regressions
