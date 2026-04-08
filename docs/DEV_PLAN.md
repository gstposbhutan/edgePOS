# btGST-edgePOS — Technical Specification & Development Plan
**Project Title**: btGST-edgePOS (Edge-Computing POS & Compliance Hub)
**Version**: 2.1
**Last Updated**: 2026-04-08
**Status**: Phase 2 — Core POS In Progress
**System Type**: Multi-tenant SaaS with Local-Edge Inference

> **FINALIZED SPECIFICATION** — This document represents the absolute source of truth for the btGST-edgePOS project. No features should be added or modified without updating this specification.

---

---

## CURRENT STATE SUMMARY

### System Overview
**btGST-edgePOS** operates on a **"Zero-Storage, Unified Identity"** model. Metadata is centralized in Supabase, while heavy assets (PDFs) are decentralized in user-owned Google Drives.

### What's Built
- Next.js 16 (App Router) + JavaScript/JSDoc (migrated from TypeScript)
- Tailwind CSS v4 + Shadcn/UI (10 base components, all converted to JSX)
- Royal Bhutan Design System (colors, fonts, glassmorphism, animations)
- Supabase schema live — 12 migrations, all tables, RLS, JWT claims hook
- Clerk integration for OAuth 2.0 "Handshake" to obtain Google Drive tokens
- Auth: login page, connectivity gate (offline hard-block), proxy route guard
- POS terminal: split-view layout, product grid, persisted cart, GST calculation
- Cart: discounts, price overrides, void items — role-gated (Manager/Owner)
- Checkout: order creation, order_items, SHA-256 signature, stock deduction trigger
- Receipt: GST 2026 compliant invoice, jsPDF export, WhatsApp shortcut
- Inventory: stock table, manual adjustments, movement history log

### Tech Stack Locked In
- **Frontend**: Next.js 16, React 19, **JavaScript (JSX) + JSDoc** — see [TD-001](TECH_DECISIONS.md#td-001)
- **Auth & Permissions**: Clerk — OAuth 2.0 for Google Drive token retrieval
- **Primary DB**: Supabase (PostgreSQL) with `pgvector` extension
- **Storage**: User-Owned Google Drive (`drive.file` scope)
- **Exception**: `/packages/accounting` (GST engine) remains TypeScript — compliance-critical
- **Exception**: Supabase DB types remain TypeScript — auto-generated, zero maintenance
- **Styling**: Tailwind CSS v4, Shadcn/UI (base-nova style), Lucide icons
- **AI/Vision**: YOLO26 ONNX + MobileNet-V3 (Edge-native dual-camera pipeline)
- **Payments**: mBoB / mPay APIs with OCR verification
- **Messaging**: WhatsApp Business API via Meta Cloud (Centralized btGST Official Bot)

---

## 1. SYSTEM ARCHITECTURE & FLOW

The system operates on a **"Zero-Storage, Unified Identity"** model. Metadata is centralized in Supabase, while heavy assets (PDFs) are decentralized in user-owned Google Drives.

### 1.1 The Checkout "Dual-Stream" Pipeline

During checkout, the system initializes two concurrent video streams:

* **Primary Stream (Payment OCR)**: Targeted at the customer's smartphone.
    * **Model**: YOLO26 ONNX.
    * **Task**: Detects the mBoB/mPay "Success" screen.
    * **Logic**: Extract `journal_no`, `amount`, and `timestamp`. Cross-reference with the active cart total.
* **Secondary Stream (Face-ID Hashtag)**: Targeted at the customer's face.
    * **Model**: MobileNet-V3 + 512-d vectorization.
    * **Task**: Generate a unique `face_hashtag`.
    * **Logic**: Query the global `buyer_registry` in Supabase to retrieve the linked phone number for WhatsApp receipt delivery.

---

## 2. VISION: THE "THREE-PILLAR" ECONOMY

**btGST-edgePOS** is a comprehensive national ecosystem encompassing:

1.  **Merchant Pillar (edgePOS)**: AI-driven retail terminal for even the non-literate
2.  **Transport Pillar (Taxi Portal)**: Real-time taxi hailing and inter-district package logistics
3.  **Consumer Pillar (Marketplace)**: Amazon-style local shopping with daily commissions

### 2.1 Taxi & Logistics Portal ("The Bhutan Uber")

**Dual-Purpose Dispatch Engine** handling both human transport and package delivery:

* **The 6 AM "Bus Station" Problem**: Merchants can "Pre-Book" a taxi for early morning pickups. The system prioritizes taxis already planning inter-district routes
* **Face-ID Verification**: Drivers must perform a Face-ID scan to start their shift, ensuring the verified PDL holder is behind the wheel
* **Offline Handshake**: In areas with no 4G, the Driver and Merchant perform a "QR Handshake" saved in **PouchDB** and synced when signal returns

**Taxi Technical Stack:**
| Component | Tech Logic |
| :--- | :--- |
| **Real-Time Map** | Mapbox GL JS with custom Bhutan terrain layers |
| **Location Tracking** | `navigator.geolocation` + Service Workers (Wake Lock API) |
| **Fare Calculation** | BCTA 2026 Revision rates auto-injected into the Fare Engine |
| **Communication** | WhatsApp-First notifications via the btGST Official Bot |

### 2.2 Marketplace & Revenue Engine

**The RMA Split-Payment Flow** using RMA DPG API:

* **Transaction**: Buyer pays Nu. 1,000 for product + Nu. 100 for Taxi Delivery
* **Split A (Merchant)**: Nu. 950 (Product - 5% Commission)
* **Split B (Rider/Taxi)**: Nu. 90 (Delivery - 10% Platform Fee)
* **Split C (Platform)**: Nu. 60 (Daily Commission Revenue)
* **Escrow**: Funds held until Rider-to-Buyer QR Handshake completion

---

## 3. TECHNICAL STACK (LOCKED)

### 3.1 Core Framework

* **Engine**: Next.js 16 (App Router) using React 19
* **Language**: JavaScript (JSX) with JSDoc for type-hinting
* **Styling**: Tailwind CSS v4 + Shadcn/UI (Nova Style)

### 3.2 Backend & Data

* **Auth & Permissions**: Clerk — OAuth 2.0 for Google Drive tokens
* **Primary DB**: Supabase (PostgreSQL) with pgvector extension
* **Vector DB**: pgvector for face_hashtag vectors
* **Storage**: User-Owned Google Drive (drive.file scope)
* **Offline**: PouchDB + IndexedDB with LWW conflict resolution

### 3.3 Integration Layer

* **WhatsApp API**: Centralized btGST Official Bot (Meta Cloud API)
* **Storage API**: Google Drive API v3 via Clerk Access Tokens
* **Payments**: mBoB/mPay APIs with RMA DPG split-payment
* **OCR/Vision**: Gemini 1.5 Flash Vision (Fallback) / YOLO26 (Edge-native)
* **Maps**: Mapbox GL JS with custom Bhutan terrain layers

---

## 4. "GHOST MODE" (OFFLINE-FIRST AI)

The system must never "freeze" when the internet drops:

1.  **Local Inference**: YOLO26 and Face-ID models run locally via WebGPU/WASM
2.  **The Persistence Layer**: All "Unsynced" sales and taxi bookings stored in IndexedDB
3.  **Conflict Resolution**: LWW (Last Write Wins) strategy to sync PouchDB with Supabase master ledger

---

## 5. DATABASE ARCHITECTURE (SUPABASE)

### 5.1 entities (The Merchants)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key (Shop ID) |
| `clerk_id` | String | Links to Clerk User for Drive Token retrieval |
| `drive_folder_id` | String | The ID of the `/btGST_Invoices` folder in their Drive |
| `tpn_number` | String | Bhutanese Tax Personal Number |

### 5.2 transactions (The Ledger)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Order ID |
| `entity_id` | UUID | Foreign Key to `entities` |
| `buyer_phone` | String | Retrieved via Face-ID Hashtag |
| `journal_no` | String | Extracted from mBoB/mPay screenshot |
| `drive_file_id` | String | Unique ID of the PDF in merchant's Drive |
| `signature` | String | SHA-256 hash of (order_id + amount + timestamp) |

### 5.3 Extended Tables (Taxi & Marketplace)

| Table | Purpose | Key Fields |
| :--- | :--- | :--- |
| `taxi_drivers` | Fleet Data | `id`, `face_vector` (vector), `license_no`, `is_active` |
| `bookings` | Trip Ledger | `pickup_geo`, `dropoff_geo`, `fare_total`, `status` |
| `marketplace_items` | Unified Catalog | `store_id`, `stock_count`, `safety_buffer` |
| `sync_logs` | Offline Health | `last_sync_timestamp`, `pending_operations_count` |

---

## 6. SECURITY & PRIVACY PROTOCOL

### 6.1 The Google Drive "Sandbox"

* **Constraint**: App uses `drive.file` scope - cannot see merchant's personal files
* **Sharing**: Invoices created with `role: reader` and `type: anyone`
* **Safety**: Links served via Proxy Route: `https://btgst.bt/v/{short_code}`

### 6.2 Face-ID Hashtag (Privacy)

* **Hashing**: Store 512-dimensional numerical vector, not photos
* **Anonymization**: Vector useless outside btGST-edgePOS ecosystem
* **Consent**: Hard-block "Opt-In" modal required once per phone number

---

## 7. COMMUNICATIONS FLOW (WHATSAPP BOT)

All communication centralized under **btGST-edgePOS official number**:

1. **Event**: POS checkout completes
2. **Action**: SaaS fetches PDF link from Merchant's Drive
3. **Action**: SaaS fetches Merchant name and Order total from Supabase
4. **Payload**: Meta Cloud API sends customized template

---

## 8. IMPLEMENTATION CHECKLIST

### 8.1 Priority 1: Drive Integration
* [ ] **Drive Init**: Server Action to check/create `/btGST_Ledger` in user's Drive
* [ ] **PDF Storage**: Save GST invoices to merchant's Drive with proper sharing

### 8.2 Priority 2: Vector Search & Face-ID
* [ ] **Vector Search**: SQL function using `match_vectors` for Face-ID lookup
* [ ] **Dual Canvas**: React 19 component with two webcam streams

### 8.3 Priority 3: Taxi & Logistics
* [ ] **Dispatcher**: `findNearestDriver` using PostGIS for 3km radius search
* [ ] **Driver Verification**: Face-ID scan for shift start with PDL validation
* [ ] **Offline Handshake**: QR transaction sync for areas without 4G

### 8.4 Priority 4: Marketplace & Payments
* [ ] **RMA Integration**: `generateRMASignature` using merchant's private `.pem` key
* [ ] **Split-Payment**: RMA DPG API for automated commission distribution
* [ ] **Stock Buffer**: Safety buffer to prevent walk-in/online conflicts

---

## 9. REVENUE SUMMARY (THE "300 STORES" GOAL)

* **Fixed Revenue**: 300 stores × Nu. 12,000/yr = **Nu. 3,600,000/yr**
* **Daily Commission**: 5% on Marketplace Sales + 10% on Taxi Bookings
* **Growth**: Become exclusive delivery partner for all 300 stores

---

## 10. PHASE ROADMAP

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
