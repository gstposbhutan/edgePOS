# btGST-edgePOS — Gap Analysis & Development Plan
**Based on**: DEV_PLAN.md v5.0 (WhatsApp-First Architecture)
**Date**: 2026-04-09
**Analyst**: Claude Code

---

## 1. WHAT THE PLAN SAYS VS WHAT EXISTS

### Phase 1 — Foundation
**Status: ✅ COMPLETE**

All items confirmed built: Next.js 16 + JS/JSDoc, Royal Bhutan design system, Shadcn/UI (10 components), Supabase schema (20 migrations), RLS on all tables, JWT custom claims hook, login page, connectivity gate, proxy route guard.

---

### Phase 2 — Core POS Features
**Status: 🔄 PARTIALLY COMPLETE (~75%)**

| # | Feature | Plan Status | Actual State | Gap |
|---|---------|------------|--------------|-----|
| 2.1 | POS split-view layout | ✅ Done | ✅ Built | None |
| 2.2 | Product search & manual add | ✅ Done | ✅ Built | None |
| 2.3 | Shopping cart with GST | ✅ Done | ✅ Built | None |
| 2.4 | Transaction recording | ✅ Done | ✅ Built | None |
| 2.5 | Payment method selector | ✅ Done | ✅ Built | None |
| 2.6 | Receipt generation | ✅ Done | ✅ Built | None |
| 2.7 | Basic inventory management | ✅ Done | ✅ Built | None |
| 2.8 | Order tracking, cancel, refund, replacement | ✅ Done | ✅ Built (UI components exist) | Partial — backend API routes not confirmed |
| 2.9 | Consumer identification at POS | ✅ Done | ✅ Built (modals exist) | None |
| 2.10 | Credit ledger & repayment | 🔵 Scoped | ⚠️ Schema only (migration 015) | **Full UI missing — Admin Hub credit dashboard, POS credit block, WhatsApp alerts** |
| 2.11 | Product packaging variants | 🔵 Scoped | ⚠️ Schema only (migrations 017–019, package-form.jsx) | **Cart/POS behavior for packages not wired, recursive stock deduction trigger not verified, UI integration incomplete** |

---

### Phase 3 — WhatsApp Platform Integration
**Status: ⏳ 0% — ENTIRELY NEW IN V5.0**

This entire phase is net-new. Nothing in the current codebase addresses it.

| # | Feature | Gap |
|---|---------|-----|
| 3.1 | WhatsApp Business Setup | Meta Business verification, API credentials not configured |
| 3.2 | WhatsApp Flows Builder | No flows JSON defined anywhere |
| 3.3 | WhatsApp Webhooks | Only `whatsapp-gateway/src/index.ts` exists as a stub |
| 3.4 | Message Templates | No templates defined or submitted for approval |
| 3.5 | Product Search Bot | No bot logic anywhere |
| 3.6 | Multi-Vendor Cart | No cross-store cart logic |

**Critical note**: The `whatsapp-gateway` service is a stub (`src/index.ts`). The entire Meta Cloud API integration, Flows schema, webhook handler, and bot decision tree must be built from scratch.

---

### Phase 4 — Vision AI Integration
**Status: ⏳ ~20% — Library stubs only**

Library files exist in `lib/vision/` but are not wired to any UI or API route.

| # | Feature | Gap |
|---|---------|-----|
| 4.1 | Camera canvas component | `camera/camera-canvas.jsx` exists — integration with live YOLO inference missing |
| 4.2 | YOLO26 ONNX integration | `lib/vision/yolo-engine.js` exists — WebGPU/WASM init, model loading, frame loop not confirmed |
| 4.3 | Product embedding DB | `lib/vision/product-embeddings.js` exists — IndexedDB seeding from Supabase not implemented |
| 4.4 | SKU auto-recognition | `lib/vision/sku-recognition.js` exists — end-to-end pipeline (detect → crop → classify → match) not wired |
| 4.5 | Face-ID loyalty | `lib/vision/face-engine.js` + `face-store.js` exist — QR consent flow, opt-in hard block, encryption at rest all missing |
| 4.6 | Payment screenshot OCR | `lib/vision/payment-ocr.js` + `components/pos/payment-scanner-modal.jsx` exist — Gemini API call not confirmed live |

**Critical note**: The `api/face/` directory exists but contains no route files. The single implemented API route (`api/payment-verify/`) needs review.

---

### Phase 5 — Taxi & Logistics
**Status: ⏳ 0% — ENTIRELY NEW IN V5.0**

No taxi-related schema, components, or logic exists anywhere in the codebase.

| # | Feature | Gap |
|---|---------|-----|
| 5.1–5.7 | All taxi features | PostGIS not enabled on Supabase, `taxi_drivers` + `bookings` tables do not exist, no WhatsApp dispatch logic, no Mapbox integration |

**Critical DB gaps**: The following tables from DEV_PLAN §5.3 do not exist in any migration:
- `taxi_drivers` (fleet + face vectors)
- `bookings` (trip ledger with PostGIS geo columns)
- `marketplace_items` (unified catalog with safety buffer)
- `sync_logs` (offline health tracking)

---

### Phase 6 — Admin Hub & Marketplace
**Status: ⏳ 0% — Scaffolded only**

Both `apps/admin-hub/` and `apps/marketplace/` contain only `node_modules` and `package.json`. No routes, components, or logic exist.

| # | Feature | Gap |
|---|---------|-----|
| 6.1–6.2 | Admin Hub (Wholesaler + Distributor dashboards) | Not started |
| 6.3 | GST Reporting Portal | Not started |
| 6.4 | Accountant Portal | Not started |
| 6.5 | Marketplace Analytics | Not started |
| 6.6 | ITC Tracking System | Not started |

---

## 2. V5.0 ARCHITECTURAL SHIFTS — NEW REQUIREMENTS

These are changes introduced in DEV_PLAN v5.0 that require **retrofitting existing code** or **new infrastructure**:

### 2.1 Google Drive PDF Storage (replaces local/server storage)
- **Plan says**: Clerk integration for OAuth 2.0 to obtain `drive.file` tokens. PDFs saved to merchant's own Google Drive. Short-link proxy at `btgst.bt/v/{short_code}`.
- **Current state**: `jsPDF` export exists in `receipt.jsx` but saves locally, no Drive integration.
- **Gap**: `clerk_id` and `drive_folder_id` columns missing from `entities` table. No Clerk SDK installed. No Drive API service. No short-link proxy route.

### 2.2 RMA DPG Payment Gateway
- **Plan says**: RMA DPG API for all payments with split-payment (merchant / rider / platform). Replaces mBoB/mPay as primary gateway.
- **Current state**: mBoB/mPay/RTGS/Cash/Credit selectors exist in cart UI. No actual gateway API calls.
- **Gap**: `generateRMASignature` not implemented. RMA webhook handler (`POST /api/webhooks/rma`) missing. Split-payment logic and escrow management not built.

### 2.3 PostGIS for Taxi Dispatch
- **Plan says**: `pickup_geo` and `dropoff_geo` as PostGIS geometry columns. `findNearestDriver` using 3km radius search.
- **Current state**: PostGIS not referenced in any migration.
- **Gap**: Requires Supabase PostGIS extension enable + new migrations for `taxi_drivers` and `bookings` tables.

### 2.4 Google Drive OAuth Token Retrieval (via Clerk or plain OAuth)
- **Plan says**: Clerk is used narrowly as a convenience layer to run the Google OAuth 2.0 flow and obtain a `drive.file`-scoped token so the app can save PDFs to each merchant's Google Drive. Supabase Auth remains the sole auth system for sessions, JWTs, and RLS — Clerk does not replace it.
- **Current state**: No Google OAuth flow exists. `receipt.jsx` saves PDFs locally only.
- **Gap**: A `drive.file` OAuth flow is needed (implementable via Clerk, `next-auth`, or a plain OAuth 2.0 route — Clerk is not mandatory). `drive_folder_id` column missing from `entities`. No Drive API calls anywhere.

### 2.5 WhatsApp OTP Login
- **Plan says**: WhatsApp-First architecture implies users can log in via phone number + WhatsApp OTP. `F-AUTH-001` already specifies WhatsApp OTP for password reset and driver shift verification.
- **Current state**: Login page uses email + password only. `whatsapp-gateway` service is a stub.
- **Gap**: No OTP generation, storage, or delivery logic. No `POST /api/auth/whatsapp/send` or `POST /api/auth/whatsapp/verify` routes. No custom JWT issuance after OTP verification. Meta does not offer a "Login with WhatsApp" OAuth — this must be built custom using Meta Cloud API via `whatsapp-gateway`. Clerk has no WhatsApp capability.

### 2.7 SUPER_ADMIN BYPASSRLS
- **Plan says**: SUPER_ADMIN uses Postgres `BYPASSRLS` role, provisioned manually, full audit logging.
- **Current state**: RLS exists but SUPER_ADMIN bypass is marked ⏳ Pending.
- **Gap**: Manual Postgres role provisioning needed. Audit log on all SUPER_ADMIN actions not implemented.

---

## 3. PENDING TECHNICAL DEBT (from DEV_PLAN §TECHNICAL DEBT)

| Risk | Severity | Gap |
|------|----------|-----|
| SUPER_ADMIN BYPASSRLS | 🔴 CRITICAL | Not provisioned |
| Face-ID capture without consent | 🟠 HIGH | QR opt-in flow missing |
| Credit limits in app logic only | 🟠 HIGH | DB-level check constraint missing on `retailer_wholesalers` |
| `order_status_log` mutability | 🟠 HIGH | Append-only RLS policy not confirmed |
| JSONB `items` column validation | 🟠 HIGH | No Zod schema in `/packages/accounting` |
| Face-ID embeddings unencrypted | 🟠 HIGH | No encryption at rest on `buyer_hash` column |
| OCR payment verification fragility | 🟠 HIGH | mBoB/mPay API not integrated |
| GST not reversed on refunds | 🟠 HIGH | `refunds.gst_reversal` not wired to GST report |
| ITC not adjusted on B2B refunds | 🟠 HIGH | ITC adjustment logic not built |
| WhatsApp delivery failure | 🟡 MEDIUM | No retry policy + no `whatsapp_status` update on failure |
| PouchDB ↔ Supabase sync conflicts | 🟡 MEDIUM | PouchDB not installed, sync-worker is a stub |
| GPU memory monitoring | 🟡 MEDIUM | No adaptive quality in yolo-engine.js |
| Data residency compliance | 🟡 MEDIUM | Supabase region not verified |

---

## 4. DEVELOPMENT PLAN

### Sprint 0 — Phase 2 Completion (Estimated: 1–2 weeks)
*Close the remaining Phase 2 gaps before starting Phase 3.*

#### S0.1 — Product Packaging (F-PKG-001)
- [ ] Verify `deduct_stock_on_confirm` trigger iterates `package_items` recursively (migration 019 review)
- [ ] Verify `guard_stock_on_confirm` checks all package components before confirming
- [ ] Wire `addPackage()` into `use-cart.js` — stores `package_id`, computes component expansion
- [ ] Packages tab in `/pos/products` — full CRUD via `package-form.jsx`
- [ ] POS product grid — package cards with component summary
- [ ] Cart display — bundle line with collapsible component list
- [ ] Inventory low-stock alert checks all package components

#### S0.2 — Credit Ledger (F-CREDIT-001)
- [ ] Add DB-level check constraint: `credit_balance <= credit_limit` (with override flag) — **resolves 🟠 HIGH tech debt**
- [ ] POS: block CREDIT payment method when limit exceeded (`use-cart.js`)
- [ ] POS: show outstanding balance + available credit when CREDIT selected
- [ ] POS: alert banner when credit < 20% remaining
- [ ] Admin Hub (stub page): Wholesaler credit dashboard — Retailer list with balances and overdue flags
- [ ] Admin Hub: Retailer credit detail — ledger, repayment history, record repayment form
- [ ] Admin Hub: Credit limit adjustment + override/freeze controls
- [ ] Supabase Edge Function: daily scheduled alert check (pg_cron)
- [ ] WhatsApp message templates: PRE_DUE_3D, DUE_TODAY, OVERDUE_3D (via whatsapp-gateway stub)

#### S0.3 — WhatsApp OTP Login (F-AUTH-001)
*Foundational — required before any WhatsApp-dependent feature can go live.*

- [ ] OTP storage: `whatsapp_otps` table (`phone`, `hashed_otp`, `expires_at`, `used`, `attempt_count`) — no RLS read access
- [ ] `POST /api/auth/whatsapp/send` — generate 6-digit OTP, hash + store, send via Meta Cloud API
- [ ] `POST /api/auth/whatsapp/verify` — verify OTP hash → call `supabase.auth.admin.createSession()` → return JWT with custom claims
- [ ] Rate limiting: max 3 OTP requests per phone per 10 minutes
- [ ] Max 3 failed attempts per OTP before invalidation
- [ ] Update login page: add "Login with WhatsApp" tab alongside email/password
- [ ] Wire `whatsapp-gateway` service: replace stub with working Meta Cloud API OTP send
- [ ] Use same OTP flow for password reset (replacing the placeholder in F-AUTH-001)

#### S0.4 — Tech Debt (Critical only)
- [ ] `order_status_log` — add `NO DELETE` RLS policy
- [ ] Zod schema for `orders.items` JSONB in `/packages/accounting`
- [ ] Verify `payment-verify` API route is live and tested
- [ ] Provision SUPER_ADMIN BYPASSRLS Postgres role (manual step, document in runbook)

---

### Sprint 1 — Google Drive Integration (Estimated: 1–2 weeks)
*Prerequisite for PDF receipts and the "zero-storage" model.*

**Note on OAuth approach**: The plan references Clerk as the OAuth helper, but this is not mandatory. A plain `GET /api/auth/google` route using the Google OAuth 2.0 REST flow (or `next-auth` with the Google provider) achieves the same result with less overhead. Decision to be made before Sprint 1 starts.

- [ ] Implement Google OAuth 2.0 flow to obtain `drive.file`-scoped token (Clerk, next-auth, or plain OAuth — TBD)
- [ ] Store OAuth token server-side, linked to the authenticated Supabase user
- [ ] Add `drive_folder_id` to `entities` table (migration 020)
- [ ] Add `drive_file_id` to `orders` table (migration 020)
- [ ] Server Action: `initDrive()` — check/create `/btGST_Ledger` folder in merchant's Google Drive
- [ ] Update `receipt.jsx`: save PDF to Drive instead of local download; return `drive_file_id`
- [ ] Build short-link proxy route: `GET /v/[short_code]` → redirects to Drive file
- [ ] RLS: only entity owner can read/write their `drive_folder_id`

---

### Sprint 2 — WhatsApp Platform (Phase 3) (Estimated: 3–4 weeks)
*The biggest new capability in V5.0.*

#### S2.1 — Infrastructure Setup
- [ ] Configure Meta Cloud API credentials in environment variables
- [ ] Build `whatsapp-gateway` service: replace stub with working Node.js service
- [ ] `POST /api/webhooks/whatsapp` — message receive + delivery status handler
- [ ] Webhook verification handshake (Meta challenge/response)
- [ ] Message template submission: receipt, alert, dispatch, refund (5 templates for Meta approval)

#### S2.2 — Receipt Delivery (lowest-risk WhatsApp use case first)
- [ ] Wire existing `receipt.jsx` → Drive PDF → WhatsApp template send on order CONFIRMED
- [ ] `whatsapp_status` update pipeline: PENDING → SENT → DELIVERED → READ
- [ ] Retry logic: 3 attempts on failed sends; flag in `audit_logs` on final failure

#### S2.3 — WhatsApp Flows (Interactive Forms)
- [ ] Product Search Flow JSON schema
- [ ] Add to Cart Flow JSON schema
- [ ] Cart Summary Flow JSON schema
- [ ] Checkout Flow JSON schema (with RMA payment link generation)
- [ ] Register all Flows with Meta API
- [ ] `POST /api/webhooks/whatsapp/flow` — flow response handler

#### S2.4 — Product Search Bot
- [ ] Bot decision tree: keyword message → query Supabase → return WhatsApp Product List
- [ ] Location-based result sorting (lat/lng from WhatsApp location message)
- [ ] Multi-vendor cart state management (session stored in Supabase `sync_logs`-equivalent)

---

### Sprint 3 — RMA DPG Payment Gateway (Estimated: 1–2 weeks)
*Unlocks marketplace revenue and taxi payments.*

- [ ] RMA sandbox account + `.pem` private key setup
- [ ] `generateRMASignature()` utility — HMAC-SHA256 with merchant private key
- [ ] `POST /api/payment/rma/initiate` — generate secure payment URL
- [ ] `POST /api/webhooks/rma` — handle payment confirmation webhook
- [ ] Split-payment logic: merchant (95%) / platform (5%) on marketplace; driver (90%) / platform (10%) on taxi
- [ ] Escrow: funds held until QR handshake delivery confirmation
- [ ] Refund processing with commission reversal
- [ ] Update cart UI: replace OCR-only mBoB/mPay flow with RMA link flow

---

### Sprint 4 — Vision AI Wiring (Phase 4) (Estimated: 2–3 weeks)
*Libraries exist — need integration and real API calls.*

#### S4.1 — Camera Pipeline
- [ ] `camera-canvas.jsx` — verify 4K video capture, SVG bounding box overlay with Royal Gold pulse
- [ ] Load `yolo26s_end2end.onnx` via ONNX Runtime Web: WebGPU → WASM → CPU fallback
- [ ] GPU memory monitoring + frame skipping under load
- [ ] Full 4-stage pipeline: detect → crop → classify → match

#### S4.2 — Face-ID
- [ ] QR opt-in consent flow (hard block — no capture without consent)
- [ ] `POST /api/face/identify` — convert camera frame to 512-d vector, match against Supabase
- [ ] `POST /api/face/enroll` — consent + store vector with encryption at rest
- [ ] `DELETE /api/face/[id]` — GDPR deletion endpoint
- [ ] Face-auth-badge → Gold "Verified" state on match

#### S4.3 — Payment OCR
- [ ] Verify `payment-verify` API route calls Gemini 1.5 Flash Vision correctly
- [ ] Wire `payment-scanner-modal.jsx` to API route end-to-end
- [ ] Store `ocr_verify_id` on successful verification

#### S4.4 — Product Embeddings
- [ ] Seed IndexedDB from Supabase `products.image_embedding` (vector sync on login)
- [ ] `sku-recognition.js` — MobileNet-V3 + cosine similarity against local vectors
- [ ] Auto-add recognized SKU to cart on match above 95% confidence threshold

---

### Sprint 5 — Taxi & Logistics (Phase 5) (Estimated: 3–4 weeks)

#### S5.1 — Database
- [ ] Enable PostGIS extension on Supabase
- [ ] Migration 021: `taxi_drivers` table (`face_vector vector(512)`, `license_no`, `is_active`, `current_location geometry(Point, 4326)`)
- [ ] Migration 021: `bookings` table (`pickup_geo geometry`, `dropoff_geo geometry`, `fare_total`, `status`, `driver_id`, `rider_id`)
- [ ] `findNearestDriver()` SQL function using PostGIS `ST_DWithin` (3km radius)
- [ ] Migration 021: `sync_logs` table

#### S5.2 — WhatsApp Dispatch Flows
- [ ] Driver Dispatch Flow JSON schema (Accept/Decline with fare details)
- [ ] Order Tracking Flow JSON schema (real-time status)
- [ ] `POST /api/taxi/request` — receive pickup request, find 3 nearest drivers, send dispatch Flow
- [ ] `POST /api/taxi/accept` — first-accept-wins logic, notify passenger, lock other driver flows
- [ ] Scheduled pickup queue: overnight booking management

#### S5.3 — Driver Verification
- [ ] WhatsApp photo → Face-ID scan for shift start
- [ ] PDL license validation check
- [ ] Enable driver "Available" status only after successful Face-ID
- [ ] `POST /api/face/driver-verify` — shift start verification endpoint

#### S5.4 — Mapbox Integration
- [ ] Install Mapbox GL JS
- [ ] Custom Bhutan terrain layer
- [ ] Route calculation for inter-district trips
- [ ] ETA display in WhatsApp tracking flow

---

### Sprint 6 — Admin Hub & Marketplace (Phase 6) (Estimated: 4–6 weeks)

#### S6.1 — Admin Hub Foundation
- [ ] Next.js 16 setup in `apps/admin-hub/` with Royal Bhutan design system
- [ ] Shared auth: Supabase JWT + Clerk session works across POS and Admin Hub
- [ ] Role-based navigation: Wholesaler vs Distributor vs SUPER_ADMIN views

#### S6.2 — Wholesaler Dashboard
- [ ] Inventory management for wholesale catalog
- [ ] Order management (wholesale orders from Retailers)
- [ ] Credit management (F-CREDIT-001 Admin Hub screens)
- [ ] Analytics: sales volume, revenue, top Retailers

#### S6.3 — Distributor Dashboard
- [ ] Entity management: create/edit/suspend Wholesalers and Retailers
- [ ] Category-level GST summary and activity reports
- [ ] Onboarding flow with WhatsApp credential delivery

#### S6.4 — SUPER_ADMIN Dashboard
- [ ] System-wide analytics (all tenants, all sales)
- [ ] Entity impersonation (switch entity context without re-auth)
- [ ] Audit log viewer
- [ ] Every impersonation session logged to `audit_logs`

#### S6.5 — GST & Accounting
- [ ] Monthly GST report aggregation (Ministry of Finance format)
- [ ] GST reversal on refunds wired to report exclusion
- [ ] ITC tracking for B2B transactions
- [ ] Accountant portal: BIT-ready P&L for 300+ clients
- [ ] One-click export to Ministry of Finance portal format

#### S6.6 — Marketplace App
- [ ] Next.js 16 setup in `apps/marketplace/`
- [ ] Public route: featured product listings (GA4 instrumented)
- [ ] Auth gate: search/cart locked behind login
- [ ] Product search + location-based results
- [ ] Consumer checkout via WhatsApp Flow (redirects to WhatsApp)
- [ ] Order tracking portal

---

## 5. DEPENDENCY MAP

```
Sprint 0 (Phase 2 complete)
  └── can start independently

Sprint 1 (Clerk + Drive)
  └── blocks Sprint 2 (WhatsApp receipt delivery needs Drive PDF link)

Sprint 2 (WhatsApp Platform)
  └── blocks Sprint 3 (RMA webhook notifies via WhatsApp)
  └── blocks Sprint 5 (Taxi dispatch is WhatsApp Flows)
  └── blocks Sprint 6 (Marketplace checkout redirects to WhatsApp)

Sprint 3 (RMA Payments)
  └── blocks Sprint 5 (taxi fare collection uses RMA)
  └── blocks Sprint 6 (marketplace checkout uses RMA)

Sprint 4 (Vision AI)
  └── independent — can run in parallel with Sprints 1–3

Sprint 5 (Taxi)
  └── requires Sprint 2 + Sprint 3

Sprint 6 (Admin Hub + Marketplace)
  └── requires Sprint 1 (Drive OAuth) + Sprint 2 (WhatsApp) + Sprint 3 (RMA)
  └── Sprint 6.5 (GST) can start after Sprint 0
```

---

## 6. RECOMMENDED START ORDER

| Priority | Sprint | Why First |
|----------|--------|-----------|
| 1 | Sprint 0 | Close open Phase 2 gaps — ships value to existing users immediately |
| 2 | Sprint 1 | Drive OAuth is a prerequisite for PDF receipts which WhatsApp delivery depends on |
| 3 | Sprint 4 | Vision AI is independent — run in parallel with Sprint 1 |
| 4 | Sprint 2 | WhatsApp is the critical path for Phase 3–6 features |
| 5 | Sprint 3 | RMA unlocks revenue flows |
| 6 | Sprint 5 | Taxi requires WhatsApp + RMA to be complete |
| 7 | Sprint 6 | Admin Hub + Marketplace is the largest sprint — save for last |

---

*This document reflects the gap between DEV_PLAN.md v5.0 (2026-04-08) and the codebase state as of 2026-04-09.*
