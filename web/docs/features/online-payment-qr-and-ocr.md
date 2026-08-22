# Feature: Online-payment QR + receipt OCR

Two related POS online-payment features. **Phase 1 (in progress)** — receipt OCR; **Phase 2 (queued)** — dynamic payment QR.

---

## Phase 1 — Camera capture + OCR the journal number (CODE COMPLETE)

**Status:** built on web + desktop. Web files: `components/pos/receipt-scan-modal.jsx` (new) wired into
`keyboard/payment-modal.jsx` + `cart-panel.jsx`. Desktop: `payment:extract-journal` IPC (main.js) +
`payment.extractJournal` preload bridge + `components/pos/receipt-scan-modal.tsx` (new) wired into
`payment-modal.tsx`. Desktop `tsc` clean; web/desktop production builds run as the gate. Runtime-unverified
on a real terminal/camera (desktop ships with the desktop release). Note: the `Cannot access variable
before it is declared` eslint findings on the scan modals are the experimental React-Compiler rule and are
pre-existing across the POS components (e.g. the older `payment-scanner-modal.jsx`) — `next build` tolerates them.

For the POS ONLINE payment method, the journal/reference number is entered as text. Add an
optional **"Scan receipt"** camera capture that photographs the customer's bank payment-confirmation
screen and OCRs the reference number into the field.

**Decisions (from the user):** web **and** desktop; desktop calls the **cloud** OCR endpoint (via its
cloud URL, needs network → offline falls back to manual typing); **extract & auto-fill** (the cashier
reviews/edits and completes — NOT a hard verify gate). Amount-match is a non-blocking hint. This keeps
OCR as a convenience, not payment verification (per CLAUDE.md).

**Reuses existing infra:** `/api/payment-verify` → `lib/vision/server-payment-ocr.js`
(`verifyPaymentImage`, GLM-4V primary + Gemini fallback) already returns `referenceNo`, `extractedAmount`,
`confidence`, `verified`. Client helper `lib/vision/payment-ocr.js` (`captureFrame`,
`verifyPaymentScreenshot`).

**Web:** new reusable `components/pos/receipt-scan-modal.jsx`; wired into both online-journal entry
points — keyboard `components/pos/keyboard/payment-modal.jsx` and touch `components/pos/cart-panel.jsx`.

**Desktop:** electron `payment:extract-journal` IPC (main POSTs the frame to `${cloudBase}/api/payment-verify`,
cloud base derived from `syncConfig.remoteUrl` like the bootstrap URL) + preload `payment.extractJournal`
bridge; new `components/pos/receipt-scan-modal.tsx`; wired into `components/pos/payment-modal.tsx` ONLINE branch.

---

## Phase 2 — Dynamic Bhutan NQRC payment QR (CODE COMPLETE)

**Status:** built web + desktop, configurable (per the user — the scheme-specific merchant-account
template is stored as vendor settings, not hardcoded). Files:
- **Payload builder** `web/lib/nqrc.js` + `desktop/lib/nqrc.ts` — pure EMVCo TLV + CRC-16/CCITT-FALSE
  (validated against the `123456789`→`29B1` check value); dynamic QR (POI 12), amount in tag 54,
  currency 064 (BTN), country BT, merchant name/city, configurable merchant-account template
  (tag/GUID/account id). `buildNqrcPayload` returns null when unconfigured → the QR is simply hidden.
- **DB** `web/supabase/migrations/116_nqrc_merchant.sql` (applied) — `entities.nqrc_*`
  (enabled, merchant_name, merchant_city, account_id, psp_guid, mcc, account_tag).
- **QR render** `web/components/pos/payment-qr.jsx` (`qrcode` lib, fetches `/api/pos/nqrc`, session-cached)
  + `desktop/components/pos/payment-qr.tsx` (`bwip-js` toSVG, reads the synced settings singleton → offline).
- **Wired before the journal step** on all three ONLINE surfaces: keyboard `payment-modal.jsx`,
  touch `cart-panel.jsx`, desktop `payment-modal.tsx`.
- **Config (OWNER + platform admin):** vendor self-serve OWNER-only section in `EntityProfileForm`
  (+ `/api/admin/settings` GET returns subRole, PATCH gates `nqrc_*` to OWNER); platform admin via a
  "Payment QR" modal in `app/admin/entities/page.jsx` (+ `/api/admin/entities/[id]` PATCH & list GET).
  Read-only `GET /api/pos/nqrc` lets any cashier render the QR at checkout.
- **Desktop sync:** `nqrc_*` carried through `/api/sync/bootstrap` → `electron/main.js` doBootstrap →
  local `settings` singleton; PB `settings` fields added via migration `023_nqrc_settings.js` + setup-pb.

**Still needed before real bank apps parse it:** the vendor/operator must enter the real RMA/Bhutan
Financial Switch **PSP GUID + merchant account id** (and confirm the template tag) from their bank's
merchant onboarding. Runtime-unverified against a live bank app.

### Original design notes

Generate a **dynamic** QR on the POS screen for the exact bill so the customer scans it with any
Bhutanese bank app (mBoB/BNB/eTeeru…) and the app auto-fills merchant + amount — no manual entry.

- **Standard:** Bhutan **National QR Code (NQRC)**, built on **EMVCo** merchant-presented QR. Data is
  TLV (tag-length-value) tags + a CRC16 checksum. Key tags: merchant account/PSP info (merchant ID /
  bank account under the RMA Bhutan Financial Switch), merchant name (tag 59), merchant city (60),
  transaction currency (53 = 064 BTN), **transaction amount (54)**, country code (58 = BT), and
  point-of-initiation (01 = dynamic/`12`). Need the exact Bhutan NQRC tag spec + which sub-tags the
  RMA switch requires (merchant ID format, PSP GUID) before implementing.
- **Merchant config:** store the vendor's NQRC merchant details (merchant name/city, account/merchant ID,
  PSP) per entity — new settings fields. Static-vs-dynamic: we build a dynamic QR embedding tag 54 (amount)
  per transaction.
- **UX / ordering (per the user):** the online-payment flow becomes **select ONLINE → show the dynamic
  QR (amount + vendor bank details baked in) for the customer to scan & pay → THEN collect the journal
  number** (typed or via the Phase-1 camera scan) → complete. So the QR step is inserted *before* the
  journal-number step, right after the method is chosen. Applies to both online entry points (web keyboard
  `payment-modal.jsx` + touch `cart-panel.jsx`, and desktop `payment-modal.tsx`).
- **Open questions:** exact Bhutan NQRC field profile (get the RMA/Financial Switch spec), whether a
  merchant-ID onboarding step with the banks is required, and whether both platforms render it (web + desktop).
