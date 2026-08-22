# Innovates POS — Gap Analysis vs Current btGST-edgePOS
**Date**: 2026-04-19
**Source**: Innovates POS Feature Requirements (Rancelabs-inspired)
**Architecture**: Dual-platform — Native Windows desktop app + Mobile PWA

---

## EXECUTIVE SUMMARY

The Innovates POS spec introduces **three fundamental architecture changes** from the current system:

1. **Windows desktop app (Tauri/Electron)** alongside the existing web app — each platform has features the other doesn't.
2. **Local SQLite database** as primary for the desktop app — current system is Supabase-first with an offline hard-block (no internet = no POS).
3. **Keyboard-first, zero-mouse UX** on desktop — current UI is touch/click-oriented. The mobile PWA remains touch-first.

### Dual-Platform Strategy

| Platform | Best For | Unique Features |
|----------|----------|-----------------|
| **Desktop (Tauri/Electron)** | Main POS terminal, high-volume checkout, hardware-connected | Keyboard navigation, ESC/POS printing, cash drawer, blind cash close, bank statement OCR, dual-camera overhead |
| **Mobile PWA (current Next.js app)** | Inventory counts, shelf stocking, portable checkout, marketplace | Camera-first scanning, photo-to-stock, face-ID, walking the floor, WhatsApp ordering, consumer marketplace |

Both platforms share the same Supabase cloud backend and sync through it. The desktop app adds a local SQLite layer for offline resilience and zero-latency operations.

---

## 1. THE CORE ENGINE

### 1.1 Offline-First Desktop App

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Windows application (Tauri/Electron) | Next.js 16 web app (browser-based) | **New app shell.** Desktop app wraps a React UI (shared with PWA) but adds native OS access for hardware, file system, and process persistence. |
| Boot, sell, print with zero internet | **Offline hard-block** — gate prevents any POS access without internet | **Architectural inversion for desktop.** Desktop app uses local SQLite as primary. PWA keeps the connectivity gate (Supabase-dependent). |
| Local SQLite database | Supabase (Postgres) as primary. No SQLite anywhere | **New database layer (desktop only).** All POS queries on desktop hit local SQLite. Supabase is sync target. PWA continues using Supabase directly. |
| Zero-latency search (10K items instant) | Product search queries Supabase — network-dependent | **Desktop: solved by SQLite.** PWA: can add IndexedDB cache for product search, but network-first is acceptable for mobile use cases. |

### 1.2 Optimistic Cloud Sync (Desktop ↔ Supabase)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Silent mirror to Supabase when online | `sync-worker` service is a stub | **Build from scratch.** Bidirectional: desktop SQLite → Supabase (transactions, inventory), Supabase → desktop SQLite (product updates, pricing). PWA reads/writes Supabase directly — no sync needed. |
| Conflict resolution | Not implemented | **Build.** LWW for metadata. Manual flag for financial discrepancies (e.g. price changed on cloud while desktop was offline). |

### 1.3 Industrial Hardware Support (Desktop Only)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Thermal printer (direct ESC/POS) | `receipt.jsx` uses `jsPDF` → browser print dialog | **Native driver needed.** Raw ESC/POS commands via `node-escpos` (Electron) or `escpos-rs` (Tauri). PWA keeps browser print for mobile receipts. |
| Cash drawer kick | Not implemented | **Desktop only.** ESC/POS kick command or USB relay. |
| Dual-camera (overhead + front) | Camera components use browser `getUserMedia` | **Desktop: native camera SDK** for precise control of overhead camera. **PWA: browser camera** is fine for shelf scanning and photo-to-stock. |

---

## 2. CHECKOUT & INPUT

### 2.1 Type-to-Filter Search

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Type → arrow keys → Enter | Product search is click/touch oriented | **Desktop: rewrite UX.** Global keyboard capture, arrow navigation, Enter to add. **PWA: touch search** is fine — type in search bar, tap result. |
| Zero loading spinners | Supabase queries show loading states | **Desktop: solved by SQLite.** PWA: IndexedDB product cache can reduce spinners. |

### 2.2 Single-Key Unit Selection

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Press 1=Pcs, 2=Pkt, 3=Ctn | Dropdown/select component for unit | **Desktop: keyboard intercept.** After item picked, number keys map to package variants. **PWA: tap-to-select** tiles for unit. Schema supports this — `product_packages` with BULK type maps to Ctn/Pkt. |
| Package hierarchy | Migrations 017–019 exist | **DB aligned, UX missing on both platforms.** |

### 2.3 AI Vision Checkout (Desktop: overhead camera. PWA: phone camera)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Overhead camera identifies items on counter | `yolo-engine.js`, `sku-recognition.js` exist as stubs | **Desktop: overhead camera pipeline.** PWA: phone camera pointed at product — same recognition logic, different hardware angle. |
| Eliminate barcode scanning | No barcode scanning built | **Aligned.** Camera replaces barcode on both platforms. |

### 2.4 Keyboard Power-User Mode (Desktop Only)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Fully navigable via physical keyboard | All navigation is click/touch | **Desktop only.** Global keyboard handler: F-keys for actions, Tab for panels, Escape to clear. PWA remains touch-first. |

---

## 3. THE "BHUTANESE REALITY" PAYMENT SUITE

### 3.1 mBoB/BNB Screen Capture

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Camera snaps customer's phone screen | `payment-scanner-modal.jsx` exists with scanning animation | **Desktop: front-facing webcam capture.** PWA: phone camera capture. Both feed the same OCR pipeline. |
| OCR reads Journal Number, Amount, Name | `payment-ocr.js` + `api/payment-verify/` exist | **Partially built.** Needs mBoB/BNB-specific parsing rules for Journal Number extraction. Works on both platforms since it's an API call. |

### 3.2 Manual Denomination Tiles

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Large touch buttons Nu. 10, 50, 100, 500, 1000 | Not implemented | **Both platforms.** Desktop: large clickable tiles (also keyboard-navigable with number pad). PWA: touch tiles. Auto-calculate change. |

### 3.3 Blind Cash Close (Desktop Only)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Staff counts cash without seeing system total | No shift management | **Desktop only.** Shift open/close, blind count entry, system vs actual — visible only to OWNER/MANAGER role. RBAC exists (F-AUTH-001). |
| Only owner sees discrepancy | Role-based visibility exists | **Aligned on roles.** Need to apply to shift reconciliation. |

---

## 4. AUDIT & RECONCILIATION

### 4.1 Daily Statement Parser (Desktop Only)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Upload PDF/Photo of bank statement | Not implemented | **Desktop only.** File upload + OCR for mBoB/BNB statement formats. Desktop has file system access for batch processing. |
| Auto-match bills to bank entries | Not implemented | **Both platforms view results.** Matching runs on desktop. Results visible in PWA dashboard. |
| Flag missing payments | Not implemented | **New.** Orders with MBOB/MPAY but no bank match = flagged. |

### 4.2 Vision-to-Bill Reconciliation (Desktop Only)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Compare camera items vs billed items | Not implemented | **Desktop only.** Overhead camera captures counter → classifies items → compares against cart. Anti-theft. |

### 4.3 WhatsApp Owner Alerts (Both Platforms)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| End-of-day cash vs bank tally | `whatsapp-gateway` is a stub | **Requires gateway to be live.** |
| High-value sale alerts | Not implemented | **New webhook.** Trigger on CONFIRMED where `grand_total > threshold`. |
| Stock-out predictions | `inventory_movements` tracks movement | **New prediction engine.** Average daily sales × remaining stock → alert when < N days. Data exists; engine doesn't. |

---

## 5. INVENTORY & VENDOR MANAGEMENT

### 5.1 Photo-to-Stock (PWA Primary)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Photo of wholesale bill → AI parses into Draft Purchase | Not implemented | **PWA primary use case.** Walking the floor, snap supplier bill → Gemini Vision OCR → draft restock entry. Desktop can also upload from file system. |

### 5.2 Khata/Credit Ledger (Both Platforms)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Customer debt tracking | F-CREDIT-001 scoped — B2B schema exists (migration 015) | **Extend for B2C.** Current schema is Retailer ↔ Wholesaler. Need consumer credit tracking (shopkeeper ↔ walk-in customer on khata). |
| Supplier Accounts Payable | Not implemented | **New.** `supplier_payables` table — what the store owes suppliers. |

### 5.3 Multi-Store Sync (Both Platforms)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Dashboard for multiple store locations | Each store operates independently | **New aggregation.** One owner → multiple entities. Cross-store inventory view, stock transfers. PWA dashboard for mobile overview, desktop for detailed management. |

---

## 6. SALES & GROWTH (MARKETPLACE)

### 6.1 1-Page Instant Marketplace (Web)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Luxury minimal page at `shopname.innovates.bt` | `apps/marketplace/` is a stub | **New build.** Aman-style single-page scroll. Simpler than DEV_PLAN marketplace. |
| Subdomain per store | Not implemented | **Dynamic routing.** `[shopname].innovates.bt` → load that store's products. |

### 6.2 Inventory-to-Web Toggle (Both Platforms)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| One-click to make product visible online | Not implemented | **New column.** `products.visible_on_web BOOLEAN`. Toggle in desktop product management or PWA inventory screen. |

### 6.3 WhatsApp Receipts (Both Platforms)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Branded PDF bills sent automatically | `receipt.jsx` generates PDF. Gateway is a stub | **Requires WhatsApp gateway.** PDF generation built. Delivery pipeline not built. |

### 6.4 WhatsApp Ordering (Marketplace → POS)

| Requirement | Current State | Gap |
|------------|---------------|-----|
| "Order via WhatsApp" → creates DRAFT in POS | Not implemented | **New.** Marketplace button → WhatsApp message → gateway parses → DRAFT order in Supabase → appears on both desktop and PWA. |

---

## 7. WHAT CAN BE REUSED

| Component | Desktop | PWA | Notes |
|-----------|---------|-----|-------|
| Supabase schema (20 migrations) | ✅ Sync target | ✅ Primary DB | Same cloud backend |
| RLS policies | ✅ | ✅ | Unchanged |
| JWT custom claims | ✅ | ✅ | Unchanged |
| GST 5% calculation | ✅ | ✅ | Channel-agnostic |
| Digital signature (SHA-256) | ✅ | ✅ | Unchanged |
| RBAC (OWNER/MANAGER/CASHIER) | ✅ | ✅ | Applied to new features |
| Credit ledger schema | ✅ Extend | ✅ Extend | Add B2C consumer credits |
| Package schema (Pcs/Pkt/Ctn) | ✅ | ✅ | Maps to single-key / tap-select |
| `receipt.jsx` / jsPDF | ✅ Adapt | ✅ Keep | Desktop adds ESC/POS output |
| Vision AI library stubs | ✅ Overhead cam | ✅ Phone cam | Same models, different capture |
| Royal Bhutan design tokens | ✅ | ✅ | Shared design system |
| WhatsApp gateway stub | ✅ Build | ✅ Build | Same service for both |
| `packages/accounting` (GST engine) | ✅ | ✅ | Unchanged |

---

## 8. ARCHITECTURE DECISIONS REQUIRED

### Decision 1: Tauri or Electron for Desktop?

| Factor | Tauri | Electron |
|--------|-------|----------|
| Binary size | ~5–10 MB | ~150 MB |
| RAM usage | ~30–50 MB | ~200–400 MB |
| Hardware drivers | Rust plugins (escpos-rs) | Node.js plugins (node-escpos) |
| Camera access | OS native APIs | Chromium `getUserMedia` |
| Team skill | Needs Rust | JavaScript only |
| Printing | Custom Rust ESC/POS | `node-escpos` (mature) |
| Offline SQLite | `rusqlite` | `better-sqlite3` (fast, sync) |
| UI rendering | WebView (shares React code with PWA) | BrowserWindow (shares React code with PWA) |

**Recommendation**: Electron — all-JavaScript stack, `node-escpos` and `better-sqlite3` are battle-tested, and the React UI code is shared directly with the PWA.

### Decision 2: Shared React UI or separate codebases?

**Recommendation**: Shared component library. Both platforms render React. Desktop-specific components (keyboard shortcuts, hardware indicators) are conditionally rendered. PWA-specific components (mobile camera, touch tiles) are conditionally rendered. Shared via the existing `/packages/ui`.

---

## 9. REVISED PHASE PLAN

### Phase 1 — Desktop Shell + Local DB (6–8 weeks)

- [ ] Electron app shell: system tray, auto-start, auto-update, window management
- [ ] SQLite embedded: schema mirroring Supabase core tables, local migration system
- [ ] All desktop POS queries retargeted to SQLite (products, cart, orders, inventory)
- [ ] ESC/POS thermal printer driver (raw commands via `node-escpos`)
- [ ] Cash drawer kick command
- [ ] Dual-camera hardware routing (overhead for products, front for payment OCR)
- [ ] Shared React component library set up for desktop + PWA reuse

### Phase 2 — Keyboard-First Checkout (3–4 weeks)

- [ ] Global keyboard event handler (F-keys, numpad, arrows, Escape)
- [ ] Type-to-filter search with arrow key navigation, Enter to add
- [ ] Single-key unit selection (1=Pcs, 2=Pkt, 3=Ctn)
- [ ] Manual denomination tiles for CASH (Nu. 10, 50, 100, 500, 1000) — desktop keyboard + PWA touch
- [ ] Change calculator with running total
- [ ] Keyboard shortcut registry + help overlay (`?` key)

### Phase 3 — OCR & Payment Verification (3–4 weeks)

- [ ] mBoB transaction screen OCR rules (Journal Number, Amount, Name)
- [ ] BNB transaction screen OCR rules
- [ ] Attach OCR result to order as `payment_ref`
- [ ] Bank statement upload + OCR parsing (desktop file system)
- [ ] Auto-match engine: statement entries ↔ orders by Journal Number
- [ ] Missing payment flagging

### Phase 4 — Cloud Sync Engine (4–6 weeks)

- [ ] Desktop SQLite → Supabase sync (orders, inventory movements, new products)
- [ ] Supabase → Desktop SQLite sync (product updates, pricing, categories)
- [ ] Conflict detection + resolution (LWW for metadata, manual flag for financial)
- [ ] System tray sync indicator (synced / syncing / pending N items)
- [ ] Offline transaction queue (FIFO, guaranteed delivery on reconnect)
- [ ] PWA continues using Supabase directly — reads synced desktop transactions

### Phase 5 — Audit & Anti-Theft (3–4 weeks)

- [ ] Shift management: open shift, blind cash close, discrepancy report (desktop)
- [ ] Vision-to-bill reconciliation: overhead camera items vs cart items (desktop)
- [ ] Discrepancy + high-value sale alerts → WhatsApp to owner
- [ ] Stock-out prediction engine (both platforms view alerts)
- [ ] Photo-to-stock: wholesale bill OCR → draft purchase order (PWA primary)

### Phase 6 — Marketplace & WhatsApp (3–4 weeks)

- [ ] WhatsApp gateway: replace stub with working Meta Cloud API
- [ ] WhatsApp receipt delivery (branded PDF)
- [ ] 1-page marketplace: `[shopname].innovates.bt`
- [ ] `products.visible_on_web` toggle
- [ ] "Order via WhatsApp" → DRAFT order in POS
- [ ] WhatsApp OTP login for marketplace consumers

---

*This document reflects the gap between Innovates POS feature requirements and the btGST-edgePOS codebase as of 2026-04-19.*
