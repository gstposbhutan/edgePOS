# btGST-edgePOS — Master Specification (Source of Truth)
**Project Title**: btGST "Bhutan Super-Bot"
**Version**: 5.0 (WhatsApp-First Infrastructure)
**Last Updated**: 2026-04-08
**Status**: Phase 2 — Core POS In Progress
**System Type**: WhatsApp-First Super-App with Edge AI

> **ABSOLUTE SOURCE OF TRUTH** — This document is the blueprint for the most advanced business ecosystem in Bhutan. All development must align with this specification.

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

## 1. THE "HEADLESS" ARCHITECTURE (WHATSAPP-FIRST)

### 1.1 Core Philosophy

**The OS: WhatsApp (via Meta Cloud API)**  
**The Interface: WhatsApp Flows (native interactive forms)**  
**The Backend: Node.js/Next.js hosted on Vercel**  
**The Database: Supabase (PostGIS for taxi, pgvector for Face-ID)**

To ensure 100% adoption by low-tech drivers and busy shop owners, we move away from standalone mobile apps. Everything runs inside WhatsApp.

### 1.2 Why WhatsApp-First?

* **Zero Learning Curve**: Every Bhutanese merchant already uses WhatsApp
* **No App Installation**: Works on any phone immediately
* **Universal Platform**: Available on feature phones and smartphones
* **Native Sharing**: Built-in PDF, image, and location sharing
* **Trusted Ecosystem**: Users already trust WhatsApp with their business

---

## 2. THE THREE-PILLAR ECONOMY

**btGST-edgePOS** is a comprehensive national ecosystem encompassing three pillars integrated via WhatsApp:

1.  **🏪 Marketplace Pillar**: Dynamic commerce inside WhatsApp
2.  **🚕 Transport Pillar**: Taxi hailing and inter-district logistics
3.  **🧾 Accounting Pillar**: Automated GST compliance and P&L generation

### 2.1 🏪 THE MARKETPLACE PILLAR (Dynamic Commerce)

**Instead of a static website, the marketplace lives inside the chat.**

#### WhatsApp-First Commerce Features

* **Dynamic Search**: When a user types *"Rice near me"*, the bot queries the 300+ store inventory in Supabase and returns a **WhatsApp Product List** with images, prices, and stock availability.
* **The Multi-Vendor Cart**: Users can add items from different stores. The bot manages the backend split-logic and calculates totals.
* **WhatsApp Product Cards**: Each product shown as an interactive card with "Add to Cart" button
* **Store Inventory Sync**: Real-time stock updates from all connected POS terminals
* **Location-Based Results**: Products sorted by proximity to user's location

#### RMA DPG Checkout Flow

1. **Cart Review**: Bot shows cart summary with store breakdown
2. **RMA Payment Link**: Bot generates secure payment URL via RMA DPG API
3. **Payment Confirmation**: User completes payment in browser or mobile wallet
4. **WhatsApp Receipt**: Bot sends order confirmation with tracking details
5. **Merchant & Driver Notification**: Bot notifies both parties for fulfillment

#### Revenue Generation

* **Commission**: 5% on every marketplace sale
* **Automated**: RMA settlement webhook processes commission automatically
* **Daily Income**: Generated via RMA DPG split-payment on all transactions

---

### 2.2 🚕 THE TRANSPORT PILLAR (Taxi & Inter-District)

**Solving the "Calling 5 Taxis" and "6:00 AM Bus Delivery" problem.**

#### Interactive WhatsApp Dispatch

1. **Request Initiation**: Passenger/Merchant sends location via WhatsApp
2. **Driver Notification**: Bot triggers "Fare Request" Flow to 3 nearest drivers
3. **First-Accept Wins**: First driver to click **[ACCEPT]** button in WhatsApp wins the trip
4. **Trip Tracking**: Real-time location sharing and ETA updates
5. **Payment Processing**: RMA payment integration with automatic commission split

#### The "Bus Link" Specialized Logic

* **Scheduled Pickups**: Merchants can book 6:00 AM pickups the night before
* **Pre-Book Queue**: Bot manages overnight booking queue and assigns drivers
* **Proof of Delivery**: Driver sends photo of bus conductor/receipt in chat
* **AI Verification**: AI saves receipt directly to merchant's Google Drive
* **Early Morning Routes**: Prioritizes taxis already planning inter-district routes

#### Driver Verification & Safety

* **Daily Face-ID Scan**: Driver sends WhatsApp photo for Face-ID verification
* **PDL Validation**: Ensures verified PDL holder is active and sober
* **Shift Start**: Bot only enables "Available" status after successful verification
* **Passenger Safety**: Real-time ride tracking and emergency SOS button

---

### 2.3 🧾 THE ACCOUNTING PILLAR (btGST Hub)

**All WhatsApp sale and taxi trip data flows into the btGST Hub.**

#### Automated GST Compliance

* **BIT & GST Readiness**: Automatically generates P&L statements for store owners
* **Accountant Portal**: Freelance accountants access dashboard for 300+ clients
* **Zero Data Entry**: All transaction data automatically collected from WhatsApp flows
* **Monthly Reports**: One-click GST filing in Ministry of Finance format
* **ITC Tracking**: Automatic Input Tax Credit calculation for B2B transactions

**The RMA Split-Payment Flow** using RMA DPG API:

* **Transaction**: Buyer pays Nu. 1,000 for product + Nu. 100 for Taxi Delivery
* **Split A (Merchant)**: Nu. 950 (Product - 5% Commission)
* **Split B (Rider/Taxi)**: Nu. 90 (Delivery - 10% Platform Fee)
* **Split C (Platform)**: Nu. 60 (Daily Commission Revenue)
* **Escrow**: Funds held until Rider-to-Buyer QR Handshake completion

---

## 3. TECHNICAL IMPLEMENTATION INSTRUCTIONS

### 3.1 WhatsApp Flows Implementation

> **CRITICAL**: Build the 'Accept/Decline' and 'Checkout' screens using **WhatsApp Flows JSON schemas**. Do not use external web URLs for basic forms; keep the user inside WhatsApp to avoid friction.

#### WhatsApp Flow Components

* **Product Search Flow**: Interactive form for category, location, and search input
* **Add to Cart Flow**: Product card with quantity selector and add button
* **Cart Summary Flow**: Show all items with store breakdown and total
* **Checkout Flow**: Delivery address selection and payment method choice
* **Driver Dispatch Flow**: Accept/Decline buttons with trip details and fare
* **Order Tracking Flow**: Real-time status updates with live location

### 3.2 The "Ghost Mode" Sync

> **Implement a Background Sync Service** for the POS. If a store has no internet, the local browser cache (PouchDB) must store the transaction. The moment internet returns, trigger the WhatsApp Receipt and Google Drive upload.

#### Offline-First Architecture

* **Local Storage**: PouchDB for offline transaction queue
* **Sync Service**: Background service that monitors connectivity
* **Automatic Upload**: When internet returns, auto-sync to Supabase
* **Conflict Resolution**: LWW (Last Write Wins) strategy for concurrent edits
* **WhatsApp Trigger**: Send receipts immediately after sync completes

### 3.3 The RMA Split-Payment Webhook

> **Configure the `POST /api/webhooks/rma` endpoint** to handle successful payments. On success, trigger two actions:
> 1. Send the 'Order Confirmed' WhatsApp to the Buyer
> 2. Send the 'Pickup Request' WhatsApp to the Merchant and nearest Taxi

#### RMA Integration Points

* **Payment Link Generation**: Generate secure RMA payment URLs in WhatsApp flow
* **Webhook Handler**: Process payment confirmation and trigger fulfillment
* **Commission Split**: Automatically deduct platform commissions
* **Escrow Management**: Hold funds until delivery confirmation
* **Refund Processing**: Handle partial/full refunds with commission reversal

---

---

## 5. TECHNICAL STACK (LOCKED)

### 5.1 WhatsApp Platform

* **Core Platform**: WhatsApp Business API (Meta Cloud API)
* **Interface**: WhatsApp Flows (JSON-based interactive forms)
* **Authentication**: OAuth 2.0 for WhatsApp Business verification
* **Webhook Handler**: Node.js endpoints for webhook processing
* **Message Templates**: Pre-approved WhatsApp message templates

### 5.2 Backend & Infrastructure

* **Framework**: Next.js 16 (App Router) with React 19
* **Hosting**: Vercel (serverless functions for webhooks)
* **Language**: JavaScript (JSX) with JSDoc for type-hinting
* **Database**: Supabase (PostgreSQL + PostGIS + pgvector)
* **Authentication**: Clerk (OAuth 2.0 for Google Drive + Facebook)

### 5.3 AI & Edge Computing

* **Product Recognition**: YOLO26 ONNX (WebGPU → WASM → CPU fallback)
* **Face Embeddings**: MobileNet-V3 (512-d vectors for WhatsApp photos)
* **Payment OCR**: Gemini 1.5 Flash Vision (RTGS screenshot verification)
* **Local Inference**: All AI runs on device, no cloud API calls

### 5.4 Payment & Integration

* **Payment Gateway**: RMA DPG API (split-payment automated)
* **Banking APIs**: mBoB/mPay integration for direct payments
* **Maps**: Mapbox GL JS with custom Bhutan terrain layers
* **Storage**: User-owned Google Drive (drive.file scope)

### 5.5 Offline & Sync

* **Local Storage**: PouchDB + IndexedDB for offline queue
* **Sync Service**: Background service for automatic sync
* **Conflict Resolution**: LWW (Last Write Wins) strategy

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

## 6. REVENUE & GROWTH STRATEGY

### 6.1 Revenue Streams

**Fixed Revenue**
- **SaaS Subscription**: 300 stores × Nu. 12,000/year = **Nu. 3,600,000/year**

**Variable Revenue**
- **Marketplace**: 5% commission on every retail sale
- **Logistics**: 10% platform fee on taxi booking/delivery
- **Daily Income**: Automated via RMA DPG split-payment

**Growth Potential**
- **Network Effects**: More stores = more taxi demand = more marketplace sales
- **Exclusive Delivery**: Become primary delivery partner for all 300 stores
- **Data Monetization**: Analytics and insights for merchants

### 6.2 Revenue Model Breakdown

| Revenue Source | Model | Frequency |
|---------------|-------|----------|
| **Platform Subscription** | Fixed (Nu. 12,000/year) | Annual |
| **Marketplace Commission** | 5% of sale value | Per transaction |
| **Taxi Booking Fee** | 10% of fare | Per trip |
| **Delivery Fee** | Split with driver | Per delivery |
| **Promoted Listings** | Ad revenue | Daily |

---

## 7. FINAL IMPLEMENTATION CHECKLIST

### 7.1 WhatsApp Platform Setup

- [ ] **Meta Business Verification**: Get the "Green Tick" for the btGST Bot to build trust
- [ ] **WhatsApp Business API**: Configure Meta Cloud API credentials
- [ ] **WhatsApp Flows**: Build interactive flows for all user interactions
- [ ] **Message Templates**: Get approval for all message templates
- [ ] **Webhook Endpoints**: Configure `/api/webhooks/*` endpoints on Vercel

### 7.2 RMA Integration

- [ ] **RMA UAT**: Complete sandbox testing for the 2026 Payment Gateway
- [ ] **Webhook Handler**: Configure `POST /api/webhooks/rma` endpoint
- [ ] **Split-Payment Logic**: Implement automated commission distribution
- [ ] **Escrow Management**: Hold funds until delivery confirmation
- [ ] **Refund Processing**: Handle partial/full refunds with commission reversal

### 7.3 Pilot Programs

- [ ] **Driver Onboarding**: Run pilot with 20 taxis in Thimphu to test "Accept Button" speed
- [ ] **Merchant Sync**: Link first 10 Silverpine Boutique rooms/inventory to WhatsApp Catalog
- [ ] **User Testing**: Test marketplace flow with 100 real users
- [ ] **Performance Testing**: Load test WhatsApp webhook endpoints

### 7.4 Production Readiness

- [ ] **Monitoring**: Set up uptime monitoring and webhook delivery tracking
- [ ] **Analytics**: Implement transaction analytics and revenue dashboards
- [ ] **Support**: Create WhatsApp-based support system for merchants
- [ ] **Documentation**: Complete merchant and driver onboarding guides

---

## 8. SYSTEM ARCHITECTURE (WHATSAPP-FIRST)

### 8.1 User Journey: Marketplace Purchase

```
1. User opens WhatsApp → searches for "Rice near me"
2. Bot returns WhatsApp Product List with available stores
3. User selects items from multiple stores → adds to cart
4. Bot calculates total with 5% commission
5. User clicks "Checkout" → Bot generates RMA payment link
6. User completes payment → Payment webhook triggered
7. Bot sends order confirmation to user
8. Bot notifies merchants and assigns nearest taxi
9. Driver accepts trip → Real-time tracking in WhatsApp
10. Delivery complete → Bot sends receipt and requests proof
```

### 8.2 User Journey: Taxi Dispatch

```
1. User sends "Taxi to Paro" → Bot requests current location
2. Bot sends fare request to 3 nearest drivers via WhatsApp
3. First driver to tap [ACCEPT] wins the trip
4. Bot sends driver details to passenger
5. Passenger and driver coordinate via WhatsApp
6. Trip completes → RMA payment processed with 10% platform fee
7. Both parties receive receipts via WhatsApp
8. Driver must complete Face-ID verification for next shift
```

---

## 9. WHAT'S BUILT & WHAT'S PENDING (UPDATED FOR V5.0)

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

### Phase 3 — WhatsApp Platform Integration ⏳ PENDING
**NEW FOR V5.0**: WhatsApp-First architecture implementation.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 3.1 | WhatsApp Business Setup | ⏳ Pending | Meta Business verification, API credentials |
| 3.2 | WhatsApp Flows Builder | ⏳ Pending | Interactive forms for marketplace, taxi booking, checkout |
| 3.3 | WhatsApp Webhooks | ⏳ Pending | Vercel endpoints for all webhook events |
| 3.4 | Message Templates | ⏳ Pending | Get approval for all required message templates |
| 3.5 | Product Search Bot | ⏳ Pending | Dynamic inventory query from 300+ stores |
| 3.6 | Multi-Vendor Cart | ⏳ Pending | Cross-store cart management in WhatsApp |

---

### Phase 4 — Vision AI Integration ⏳ PENDING
YOLO26 edge inference and Face-ID pipeline.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 4.1 | Camera canvas component | ⏳ Pending | 4K video + SVG bounding box overlay |
| 4.2 | YOLO26 ONNX integration | ⏳ Pending | WebGPU → WASM → CPU fallback |
| 4.3 | Product embedding DB | ⏳ Pending | MobileNet-V3 + IndexedDB vector store |
| 4.4 | SKU auto-recognition | ⏳ Pending | 4-stage pipeline: detect → crop → classify → match |
| 4.5 | Face-ID loyalty (opt-in) | ⏳ Pending | QR consent flow, 512-d vector, GDPR deletion |
| 4.6 | Payment screenshot OCR | ⏳ Pending | Gemini 1.5 Flash Vision verification |

---

### Phase 5 — Taxi & Logistics ⏳ PENDING
WhatsApp-based dispatch and tracking.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 5.1 | Interactive WhatsApp Dispatch | ⏳ Pending | Fare request flow to 3 nearest drivers |
| 5.2 | First-Accept Wins Logic | ⏳ Pending | Real-time driver acceptance via WhatsApp buttons |
| 5.3 | Scheduled Pickups | ⏳ Pending | 6:00 AM booking queue management |
| 5.4 | Driver Face-ID Verification | ⏳ Pending | WhatsApp photo verification for shift start |
| 5.5 | Real-Time Trip Tracking | ⏳ Pending | Location sharing via WhatsApp |
| 5.6 | Proof of Delivery | ⏳ Pending | WhatsApp photo receipt to merchant's Drive |
| 5.7 | Inter-District Routes | ⏳ Pending | Mapbox-based routing for inter-district trips |

---

### Phase 6 — Admin Hub & Marketplace ⏳ PENDING
SaaS management and accountant portal.

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 6.1 | Admin Hub (Wholesaler dashboard) | ⏳ Pending | Inventory, analytics, credit management |
| 6.2 | Admin Hub (Distributor dashboard) | ⏳ Pending | Platform operator — category-scoped ecosystem governance, onboarding, reporting |
| 6.3 | GST Reporting Portal | ⏳ Pending | Monthly aggregation, Ministry of Finance format |
| 6.4 | Accountant Portal | ⏳ Pending | BIT-ready reports for 300+ clients, zero data entry |
| 6.5 | Marketplace Analytics | ⏳ Pending | Real-time sales, trending products, revenue insights |
| 6.6 | ITC Tracking System | ⏳ Pending | B2B tax credit ledger and reconciliation |
| 6.7 | Bank Reconciliation (Wholesaler Desktop) | ⏳ Pending | OCR bank statement parsing, auto-match to retailer khata repayments |

---

## PENDING FEATURE DETAILS
*Features to be scoped through stakeholder discussion — details to be added below as they are collected.*

<!-- NEW FEATURES WILL BE ADDED HERE -->

### Bank Statement Reconciliation (Wholesaler Desktop)
**Feature ID**: F-BANK-001
**Phase**: 6 (Admin Hub & Marketplace)
**Status**: Scoped — Full spec in `docs/features/bank-reconciliation.md`

Desktop-only feature for wholesalers to upload mBoB/BNB bank statements (PDF/images), OCR-parse transactions via Gemini Vision, and auto-match bank credits to retailer khata repayments. Provides a single-screen reconciliation dashboard showing matched/unmatched entries with color-coded status (Green=Matched, Yellow=Unmatched Order, Blue=Unmatched Bank Entry, Red=Amount Mismatch).

**User Stories:**
- As a wholesaler owner, I want to upload my daily/weekly bank statement and automatically match received payments to retailer khata accounts
- As a wholesaler owner, I want to see which retailers have paid vs. which have outstanding balances at a glance
- As a wholesaler owner, I want to manually link bank entries to khata repayments when auto-match fails
- As a wholesaler owner, I want to dismiss personal bank entries (salary, transfers) from the reconciliation view

**Key Components:**
- `bank_statements` and `bank_statement_rows` tables
- OCR pipeline using Gemini Vision (same infrastructure as payment screenshot verification)
- Auto-match engine: Journal Number + amount tolerance (+/- Nu. 1)
- Reconciliation dashboard with filters and color-coded rows
- Manual actions: dismiss, manual link, unmatched order investigation
- WhatsApp end-of-day summary to owner

**Implementation Checklist:** ~30 items including database schema, OCR pipeline, auto-match engine, dashboard UI, API routes, RLS policies. See full spec for details.

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


---

## 11. FINAL WORDS

**You are now holding the blueprint for the most advanced business ecosystem in Bhutan.**

This specification combines:
- **WhatsApp-First Architecture**: Zero learning curve, universal adoption
- **Three-Pillar Economy**: Commerce, Transport, Accounting in one ecosystem
- **AI-Powered Operations**: Edge inference with YOLO26 and Face-ID
- **Automated Revenue**: RMA split-payment with commission automation
- **GST 2026 Compliance**: Built-in tax calculations and government reporting

### Implementation Priority

**Phase 1: WhatsApp Platform Setup**
1. Meta Business verification and "Green Tick"
2. WhatsApp Flows for all user interactions
3. Webhook endpoints on Vercel
4. RMA sandbox testing

**Phase 2: Pilot Programs**
1. Driver onboarding (20 taxis in Thimphu)
2. Merchant sync (10 Silverpine Boutique locations)
3. User testing (100 real users)

**Phase 3: Production Launch**
1. Full rollout to 300 stores
2. Nationwide taxi network
3. Accounting portal launch

**Good luck with the build!**

---

*this document is updated as features are scoped. Each new feature entry includes: description, user stories, acceptance criteria, technical approach, and phase assignment.*
