# NEXUS BHUTAN — Development Plan
**Version**: 1.3  
**Last Updated**: 2026-04-07  
**Status**: Phase 2 — Core POS In Progress

---

## CURRENT STATE SUMMARY

### What's Built
- Next.js 16 (App Router) + JavaScript/JSDoc (migrated from TypeScript)
- Tailwind CSS v4 + Shadcn/UI (10 base components, all converted to JSX)
- Royal Bhutan Design System (colors, fonts, glassmorphism, animations)
- Supabase schema live — 12 migrations, all tables, RLS, JWT claims hook
- Auth: login page, connectivity gate (offline hard-block), proxy route guard
- POS terminal: split-view layout, product grid, persisted cart, GST calculation
- Cart: discounts, price overrides, void items — role-gated (Manager/Owner)
- Checkout: order creation, order_items, SHA-256 signature, stock deduction trigger
- Receipt: GST 2026 compliant invoice, jsPDF export, WhatsApp shortcut
- Inventory: stock table, manual adjustments, movement history log

### Tech Stack Locked In
- **Frontend**: Next.js 16, React 19, **JavaScript (JSX) + JSDoc** — see [TD-001](TECH_DECISIONS.md#td-001)
- **Exception**: `/packages/accounting` (GST engine) remains TypeScript — compliance-critical
- **Exception**: Supabase DB types remain TypeScript — auto-generated, zero maintenance
- **Styling**: Tailwind CSS v4, Shadcn/UI (base-nova style), Lucide icons
- **State/Offline**: PouchDB + IndexedDB (planned)
- **Cloud DB**: Supabase + pgvector (planned)
- **AI/Vision**: YOLO26 ONNX + MobileNet-V3 (planned)
- **Payments**: mBoB / mPay APIs (planned)
- **Messaging**: WhatsApp Business API via Meta Cloud (planned)

---

## PHASE ROADMAP

### Phase 1 — Foundation ✅ COMPLETE
Core framework, design system, and database schema.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.1 | Next.js 16 + JS/JSDoc setup | ✅ Done | `allowJs`, `checkJs: false`, JSX includes, ESLint scoped to TS files only |
| 1.2 | Royal Bhutan Design System | ✅ Done | Colors, fonts, glassmorphism |
| 1.3 | Shadcn/UI component library | ✅ Done | 10 base components |
| 1.4 | Supabase schema (core tables) | ✅ Done | 12 migrations run — all tables, triggers, indexes, inventory automation live |
| 1.5 | Row-Level Security (RLS) | ✅ Done | RLS on all tables, JWT helper functions, all policies applied |
| 1.6 | Authentication & RBAC | ✅ Done | Login page, connectivity gate, proxy route guard, role-based redirect |

---

### Phase 2 — Core POS Features 🔄 IN PROGRESS
Manual POS operations before AI integration.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.1 | POS Layout (split-view) | ✅ Done | Products left, cart right, customer badge, inventory nav, sign out |
| 2.2 | Product search & manual add | ✅ Done | Catalogue management — add/edit, barcode, reorder point, batch details |
| 2.11 | Product packaging variants | 🔵 Scoped | Packages are first-class products (BULK/BUNDLE/MIXED), sold_as_package_only flag, `sellable_products` view, `package_available_qty()` — see [F-PKG-001](features/product-packaging.md) |
| 2.3 | Shopping cart with GST | ✅ Done | 5% GST on taxable amount, discounts, price overrides, void — role-gated |
| 2.4 | Transaction recording | ✅ Done | order + order_items, SHA-256 signature, stock deduction trigger |
| 2.5 | Payment method selector | ✅ Done | mBoB, mPay, RTGS, Cash, Credit in cart panel |
| 2.6 | Receipt generation | ✅ Done | GST 2026 invoice, jsPDF export, WhatsApp shortcut |
| 2.7 | Basic inventory management | ✅ Done | Stock table, adjust modal (restock/loss/damaged), movement history |
| 2.8 | Order tracking, cancellation, refund, replacement | ✅ Done | Order list, detail, status timeline, cancel/refund modals, role-gated |
| 2.9 | Consumer identification at POS | ✅ Done | WhatsApp modal hard-blocks checkout, Face-ID badge |
| 2.10 | Credit ledger & repayment tracking | 🔵 Scoped | Per-relationship ledger, hard block, partial repayments, escalating alerts — see [F-CREDIT-001](features/credit-ledger.md) |

---

### Phase 3 — Vision AI Integration ⏳ PENDING
YOLO26 edge inference and Face-ID pipeline.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 3.1 | Camera canvas component | ⏳ Pending | 4K video + SVG bounding box overlay |
| 3.2 | YOLO26 ONNX integration | ⏳ Pending | WebGPU → WASM → CPU fallback |
| 3.3 | Product embedding DB | ⏳ Pending | MobileNet-V3 + IndexedDB vector store |
| 3.4 | SKU auto-recognition | ⏳ Pending | 4-stage pipeline: detect → crop → classify → match |
| 3.5 | Face-ID loyalty (opt-in) | ⏳ Pending | QR consent flow, 512-d vector, GDPR deletion |
| 3.6 | Payment screenshot OCR | ⏳ Pending | Gemini 1.5 Flash Vision verification |

---

### Phase 4 — Offline Sync & Supply Chain ⏳ PENDING
Resilient offline operations and B2B logistics.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 4.1 | PouchDB offline sync | ⏳ Pending | IndexedDB → Supabase, CRDT conflict resolution |
| 4.2 | Sync status monitor | ⏳ Pending | Health indicator, queue depth, last-sync time |
| 4.3 | WhatsApp PDF receipts | ⏳ Pending | Meta Cloud API + PDF generator |
| 4.4 | Predictive restocking | ⏳ Pending | <15% stock → WhatsApp alert → Confirm restock |
| 4.5 | Wholesale order API | ⏳ Pending | Credit-limit check, auto-reserve inventory |
| 4.6 | Toofan/Rider dispatch | ⏳ Pending | Last-mile delivery webhook integration |

---

### Phase 5 — Admin Hub & Marketplace ⏳ PENDING
SaaS management and consumer portal.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 5.1 | Admin Hub (Wholesaler dashboard) | ⏳ Pending | Inventory, analytics, credit management |
| 5.5 | Admin Hub (Distributor dashboard) | 🔵 Scoped | Platform operator — category-scoped ecosystem governance, onboarding, reporting — see [F-DIST-001](features/distributor-role.md) |
| 5.2 | GST reporting | ⏳ Pending | Monthly aggregation, Ministry of Finance format |
| 5.3 | Marketplace portal | ⏳ Pending | Consumer-facing product discovery |
| 5.4 | ITC tracking | ⏳ Pending | B2B tax credit ledger |

---

## PENDING FEATURE DETAILS
*Features to be scoped through stakeholder discussion — details to be added below as they are collected.*

<!-- NEW FEATURES WILL BE ADDED HERE -->

---

## TECHNICAL DEBT & RISKS

### Legend
🔴 CRITICAL — launch blocker, must resolve before first user  
🟠 HIGH — resolve before feature goes live  
🟡 MEDIUM — resolve before production scale  
🟢 LOW — monitor, address when capacity allows

---

### Security & Compliance

| Risk | Severity | Status | Mitigation | Ref |
|------|----------|--------|-----------|-----|
| No RLS → cross-tenant data leakage | 🔴 CRITICAL | 🔵 Resolved | RLS enabled on all 14 tables; `entity_id` JWT claim enforced in all policies | F-AUTH-001 |
| SUPER_ADMIN bypasses all RLS | 🔴 CRITICAL | ⏳ Pending | `BYPASSRLS` Postgres role — provision manually, no self-registration, full audit logging on every action | F-AUTH-001 |
| Face-ID capture without consent | 🟠 HIGH | ⏳ Pending | QR opt-in consent flow required before any biometric data is captured or stored | F-AUTH-001 |
| Credit limits enforced in app logic only | 🟠 HIGH | ⏳ Pending | Add DB-level check constraints on `credit_limit`; enforce in `retailer_wholesalers` table | F-ORDER-001 |
| Anonymous POS transactions | 🟠 HIGH | 🔵 Resolved | Blocked by design — Face-ID or WhatsApp number required to confirm any transaction | F-ORDER-001 |
| Bhutan data residency compliance | 🟡 MEDIUM | ⏳ Pending | Verify Supabase region availability for Bhutan/South Asia; confirm Face-ID embedding storage compliance | — |
| No audit trail on SUPER_ADMIN impersonation | 🟠 HIGH | ⏳ Pending | Every impersonation session must be logged to `audit_logs` with actor, target entity, duration, and actions taken | F-AUTH-001 |

---

### Payments & Transactions

| Risk | Severity | Status | Mitigation | Ref |
|------|----------|--------|-----------|-----|
| OCR payment verification fragility | 🟠 HIGH | ⏳ Pending | Replace Gemini OCR with mBoB/mPay official APIs; OCR kept only as last-resort fallback for RTGS | F-ORDER-001 |
| Double-charge on payment retry | 🟠 HIGH | 🔵 Resolved | Idempotency key (`order_id + attempt_number`) sent to gateway on every attempt | F-ORDER-001 |
| Payment failure with no retry cap | 🟠 HIGH | 🔵 Resolved | Max 3 retries enforced; exceeded → PAYMENT_FAILED state, manager escalation via WhatsApp | F-ORDER-001 |
| Refund issued via different payment method | 🟡 MEDIUM | 🔵 Resolved | Refunds must match original payment method; single exception for CASH → mPay with cashier approval | F-ORDER-001 |
| GST not reversed on refunded transactions | 🟠 HIGH | ⏳ Pending | `refunds.gst_reversal` computed and excluded from monthly GST report totals | F-ORDER-001 |
| ITC not adjusted on B2B wholesale refunds | 🟠 HIGH | ⏳ Pending | ITC adjustment entry created in credit ledger on every approved wholesale refund | F-ORDER-001 |

---

### Data Architecture

| Risk | Severity | Status | Mitigation | Ref |
|------|----------|--------|-----------|-----|
| `parent_entity_id` single-parent assumption | 🔴 CRITICAL | 🔵 Resolved | Removed — replaced by `retailer_wholesalers` junction table (many-to-many per category) | F-DIST-001 |
| Single `category_id` FK on entities/products | 🟠 HIGH | 🔵 Resolved | Replaced by `entity_categories` and `product_categories` junction tables | F-DIST-001 |
| `order_status_log` mutability | 🟠 HIGH | ⏳ Pending | Append-only policy — no UPDATE or DELETE RLS; compliance record | F-ORDER-001 |
| JSONB `items` column has no schema validation | 🟠 HIGH | ⏳ Pending | Zod schema validation in `/packages/accounting` before any JSONB write | CLAUDE.md |
| TypeScript `any` creep in frontend code | 🟡 MEDIUM | 🔵 Resolved | Frontend migrated to JavaScript (JSDoc); removes false type-safety illusion | TD-001 |
| Face-ID embeddings stored without encryption | 🟠 HIGH | ⏳ Pending | Customer-managed keys for `buyer_hash` vector column; encryption at rest | CLAUDE.md |

---

### Infrastructure & Reliability

| Risk | Severity | Status | Mitigation | Ref |
|------|----------|--------|-----------|-----|
| 4K processing on low-end devices | 🟡 MEDIUM | ⏳ Pending | WebGPU → WASM multi-threaded → CPU fallback with capability detection on startup | CLAUDE.md |
| Offline POS with stale JWT | 🟠 HIGH | 🔵 Resolved | Hard-block offline auth — no session without live connectivity; prevents stale-token transactions | F-AUTH-001 |
| WhatsApp notification delivery failure | 🟡 MEDIUM | ⏳ Pending | 3-retry policy on failed sends; failed notifications flagged in `audit_logs`; `whatsapp_status` tracked per order | F-ORDER-001 |
| PouchDB ↔ Supabase sync conflict resolution | 🟡 MEDIUM | ⏳ Pending | CRDT-based conflict resolution strategy to be defined in Phase 4 | — |
| No GPU memory monitoring during YOLO inference | 🟡 MEDIUM | ⏳ Pending | Adaptive quality scaling based on device memory; frame skipping under load | CLAUDE.md |
| Credit ledger not yet scoped | 🟠 HIGH | ⏳ Pending | F-CREDIT-001 must be scoped before CREDIT payment method goes live | F-ORDER-001 |

---

### Status Key
🔵 Resolved — decision made, documented, mitigated by design  
⏳ Pending — known risk, mitigation strategy identified, not yet implemented

---

## KEY PERFORMANCE TARGETS

| Metric | Target |
|--------|--------|
| YOLO26 inference time | < 100ms (GPU) |
| Product recognition accuracy | > 95% |
| Cloud sync latency | < 5 seconds |
| GST calculation accuracy | 100% |
| Transaction processing time | < 30 seconds |
| Offline uptime | 100% functionality |

---

*This document is updated as features are scoped. Each new feature entry includes: description, user stories, acceptance criteria, technical approach, and phase assignment.*
