# NEXUS BHUTAN - Developer Reference Guide

## Project Identity & Context

**Project Name**: NEXUS BHUTAN  
**Full Name**: 4K Edge-AI & GST Master Blueprint (2026)  
**System Type**: Local-First AI POS & Multi-Tier Supply Chain Ecosystem  
**Target Market**: Bhutan retail ecosystem (Distributors → Wholesalers → Retailers)  
**Core Mandate**: 4K Vision. Local Inference (YOLO26). 5% GST Compliance. WhatsApp-Led Logistics. Zero Keyboard Interface.

---

## 🏗️ MONOREPO ARCHITECTURE

This project uses Turborepo for efficient code sharing between high-performance POS terminal and cloud-based SaaS management hub.

```
/nexus-bhutan
├── /apps
│   ├── /pos-terminal      # Next.js PWA: 4K Camera + YOLO26 Engine (GPU accelerated) [CURRENT DIRECTORY]
│   ├── /admin-hub         # React-based SaaS for Wholesalers & Retailers (Inventory, Analytics, Credit)
│   └── /marketplace       # Next.js Consumer Portal: "Amazon-style" local discovery and ordering
├── /packages
│   ├── /database          # Shared Prisma/Drizzle schemas, Supabase Client, and Migration scripts
│   ├── /ai-core           # YOLO26 ONNX weights, Face-ID vector utils, and Gemini Vision prompts
│   ├── /accounting        # 2026 GST Engine: ITC tracking, Tax reconciliation, and PDF generation
│   ├── /shared-utils      # Common TypeScript types, validation logic, and currency formatters
│   └── /ui                # Design System: Custom Shadcn components with Royal Bhutan aesthetic
├── /services
│   ├── /whatsapp-gateway  # Meta Cloud API Node.js microservice for PDF delivery and alerts
│   ├── /sync-worker       # PouchDB-to-Supabase background sync for offline-resilient operations
│   └── /logistics-bridge  # Webhook handlers for Toofan and Rider app integrations
```

---

## 🗄️ DATABASE SCHEMA (POSTGRES / SUPABASE)

### Core Design Philosophy
Multi-tier isolation ensuring individual business data remains private while "Central Brain" shares product knowledge.

### entities (Multi-tenant Foundation)
Represents every participant in the supply chain.
- `id`: UUID (PK)
- `name`: String (Business Legal Name)
- `role`: Enum (DISTRIBUTOR, WHOLESALER, RETAILER)
- `tpn_gstin`: String (Unique) - Bhutanese Taxpayer Number for GST 2026 compliance
- `whatsapp_no`: String (E.164 format) - Primary channel for all system communications
- `credit_limit`: Decimal - Managed by Wholesalers for their Retailer network
- `parent_entity_id`: UUID (Self-ref) - Establishes hierarchy (Retailer → Wholesaler → Distributor)

### products (Central Brain Vector Library)
Shared repository for product identification across Bhutan.
- `id`: UUID (PK)
- `name`: String
- `hsn_code`: String - Required for GST categorization
- `image_embedding`: Vector(1536) - Used for high-accuracy visual SKU matching
- `current_stock`: Int (Per-store inventory level)
- `wholesale_price`: Decimal (Rate at which retailer buys)
- `mrp`: Decimal (2026 regulated maximum retail price)

### transactions (Accounting Ledger)
Tamper-proof record of every sale, serving as source of truth for GST reporting.
- `id`: UUID (PK)
- `inv_no`: String (Unique Index) - Formatted as SHOP-YYYY-SERIAL
- `journal_no`: BigInt (Serial) - For sequential double-entry bookkeeping
- `seller_id`: UUID (FK) - Link to merchant
- `buyer_hash`: Vector(512) - Anonymized Face-ID embedding for loyalty without privacy breach
- `items`: JSONB - Detailed snapshot: [{sku, name, qty, rate, discount, gst_5, total}]
- `subtotal`: Decimal (Pre-tax total)
- `gst_total`: Decimal (Strict 5% flat calculation)
- `grand_total`: Decimal (Final amount payable)
- `payment_method`: Enum (MBOB, MPAY, RTGS, CASH, CREDIT)
- `ocr_verify_id`: String - Unique ID from Gemini's successful payment verification
- `whatsapp_status`: Enum (SENT, DELIVERED, READ) - Delivery tracking for digital receipt

### CRITICAL ADDITIONS (From Architecture Review)
**audit_logs** - Compliance + fraud detection tracking
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  table_name TEXT,
  record_id UUID,
  operation TEXT, -- INSERT/UPDATE/DELETE
  old_values JSONB,
  new_values JSONB,
  actor_id UUID,
  timestamp TIMESTAMPTZ
);
```

**inventory_movements** - Stock flow tracking for reconciliation
```sql
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY,
  product_id UUID,
  entity_id UUID,
  movement_type TEXT, -- SALE/RESTOCK/TRANSFER/LOSS/DAMAGED
  quantity INT,
  reference_id UUID, -- transaction_id or transfer_id
  timestamp TIMESTAMPTZ
);
```

---

## 🔌 API ROUTES & MIDDLEWARE

### Local POS API (Hono.js on Bun)
Optimized for low-latency interactions in physical store.
- `POST /local/scan`: Processes 4K frame buffers; returns local YOLO26 detection coordinates
- `POST /local/face-identify`: Converts camera stream to 512-d vector for customer recognition
- `POST /local/payment-verify`: Securely relays payment screenshots to Gemini 1.5 Flash Vision for fraud detection
- `GET /local/sync-status`: Monitors health of local IndexedDB to Cloud Supabase data bridge

### Global SaaS API (Cloud)
Manages broader ecosystem and supply chain logistics.
- `POST /v1/wholesale/order`: Enables retailers to restock from wholesalers with automated credit-limit checks
- `GET /v1/accounting/gst-report`: Aggregates 5% GST data for monthly government filing
- `POST /v1/whatsapp/receipt`: Orchestrates PDF generator and triggers Meta Cloud API
- `POST /v1/marketplace/dispatch`: Notifies Toofan/Rider agents for last-mile delivery

---

## 👁️ AI & VISION PIPELINE (YOLO26 EDGE INFERENCE)

### Model Specifications
- **Model**: yolo26s_end2end.onnx (Native multi-object handling)
- **Hardware Acceleration**: WebGPU (modern browsers) → WASM Multi-threaded (older hardware) → CPU (fallback)
- **Input Resolution**: 4K capture downsampled to 640x640 for YOLO, high-res crops for classification

### Recognition Workflow
**Stage 1 (Localization)**: 4K stream downsampled to 640x640. YOLO26 identifies bounding boxes for all items.

**Stage 2 (High-Res SKU Match)**: System crops original 4K resolution frame at detected coordinates.

**Stage 3 (Classification)**: High-fidelity crops passed to local MobileNet-V3 feature extractor. Vector compared against local IndexedDB "Product Embeddings" for 99.9% SKU match.

**Stage 4 (Customer Sync)**: Simultaneous front-camera feed generates Face-ID hash. If exists in local cache, customer's name and WhatsApp number instantly pulled to "Invisible Cart."

### Performance Considerations
- **Frame Skipping**: Skip frames based on processing latency to maintain UI responsiveness
- **GPU Memory Monitoring**: Adaptive quality scaling based on device capabilities
- **Progressive Enhancement**: Capability detection with graceful degradation

---

## 🎨 UI/UX & DESIGN TOKENS (ROYAL BHUTAN SYSTEM)

### Design Philosophy
Interface must be accessible to non-tech users while feeling like an elite, million-dollar product.

### Design Tokens
```javascript
colors: {
  obsidian: '#0F172A',    // Primary background - High contrast, premium look
  gold: '#D4AF37',        // Primary accent - "Success" states and primary CTAs  
  emerald: '#10B981',     // Secondary accent - "Item Recognized" and "Payment Verified"
  tibetan: '#EF4444',     // System danger - Flags fraudulent screenshots or low stock
}
fonts: {
  primary: 'Noto Sans',   // Readability
  display: 'Noto Serif',  // Traditional Bhutanese touch in headers
}
effects: {
  glassmorphism: 'backdrop-blur-xl bg-slate-900/40' // Depth and modernity
}
```

### Core UI Components
- **CameraCanvas**: Custom component overlaying real-time SVG grid on 4K video feed. Bounding boxes pulse with "Royal Gold" when item confirmed.
- **DynamicReceipt**: Sliding vertical list using Framer Motion physics-based animations as items "dropped" into virtual basket.
- **FaceAuthBadge**: Corner-floating indicator. Grey/neutral until face recognized, then transitions to Gold "Verified" state.
- **PaymentScanner**: Immersive modal guiding user to hold phone up. Features "scanning line" animation syncing with Gemini OCR verification.

### Responsive Layout Strategy
**4K Desktop POS** (Primary):
- Split view: Camera/Products on left, Shopping Cart on right
- Full grid layout with quick action buttons
- Face-ID badge in top right corner

**Tablet/Mobile** (Secondary):
- Full-width camera view
- 2-column product grid
- Slide-up cart drawer

---

## 🌍 BHUTAN GST 2026 LOGIC & COMPLIANCE

### Tax System
- **Flat Rate**: Every taxable item automatically calculated at 5% GST
- **Input Tax Credit (ITC)**: When Wholesaler sells to Retailer, GST recorded as "Credit" in Retailer's ledger for offsetting tax liability
- **Digital Signatures**: Each invoice includes SHA-256 hash from inv_no, grand_total, seller_tpn (eliminates physical stamps)
- **Reporting**: Admin-Hub provides one-click GST-REPORTS formatted for Bhutanese Ministry of Finance portal

### Calculation Logic
```javascript
// Strict 5% flat rate calculation
gst_amount = subtotal * 0.05
grand_total = subtotal + gst_amount

// ITC tracking for B2B transactions
if (transaction_type === 'B2B') {
  buyer.itc_balance += gst_amount  // Credit for buyer
  seller.gst_collected += gst_amount // Liability for seller
}
```

---

## 📦 LOGISTICS & SUPPLY CHAIN INTEGRATION

### Predictive Restocking
- When `products.current_stock < 15%`: Wholesaler receives WhatsApp notification
- Retailer prompted to "Confirm Restock" via single button on POS
- Automated RTGS verification for large Indian-Bhutanese transfers
- 4K camera scans RTGS acknowledgement → Gemini extracts Reference Number
- Wholesaler inventory instantly reserved for Retailer

### Last-Mile Delivery
- Integration with Toofan and Rider App via webhooks
- Consumer orders through Marketplace → Delivery request automatically dispatched
- Contains Retailer location + WhatsApp-ready order summary

---

## 🔒 SECURITY & COMPLIANCE REQUIREMENTS

### CRITICAL Security Implementation
1. **Row-Level Security (RLS)**: Enable Supabase RLS policies for tenant isolation (Retailer A cannot see Retailer B's data)
2. **Banking API Integration**: Replace OCR payment verification with mBoB/mPay official APIs (OCR is architecturally fragile)
3. **Input Validation**: Implement Zod schemas for all JSONB columns to prevent SQL injection
4. **Audit Logging**: Comprehensive tracking for compliance + fraud detection
5. **Credit Limit Enforcement**: Database-level constraints to prevent overspending

### Privacy & Data Protection
- **Face-ID Opt-In**: Explicit QR code consent flow for biometric data collection
- **Right to Deletion**: GDPR-style API for biometric data removal
- **Encryption at Rest**: Customer-managed keys for Face-ID embeddings
- **Data Residency**: Verify Supabase compliance with Bhutanese data storage requirements

---

## 🚀 TECH STACK IMPLEMENTATION STATUS

### ✅ COMPLETED
- [x] Next.js 15 project initialized with TypeScript
- [x] Tailwind CSS configured with App Router
- [x] Git repository with comprehensive README
- [x] Monorepo structure foundation

### 🔄 IN PROGRESS  
- [ ] Shadcn/UI component library installation
- [ ] Royal Bhutan theme token configuration
- [ ] Supabase database schema setup
- [ ] Row-Level Security implementation

### ⏳ PENDING
- [ ] YOLO26 ONNX runtime integration
- [ ] PouchDB offline sync setup
- [ ] GST calculation engine
- [ ] Banking API integration (mBoB/mPay)
- [ ] WhatsApp gateway service
- [ ] Face-ID authentication system
- [ ] Supply chain management features

---

## 📱 PRODUCTION-READY POS REFERENCES

Study these systems for UI/UX patterns:
1. **Square POS** - Tablet-based minimal keyboard design, gesture-based item selection
2. **Shopify POS** - Customer-facing display, bulk action buttons, barcode integration  
3. **Toast POS** - Offline-first patterns, color-coded status indicators
4. **Loyverse POS** - Low-literacy icon design, simple dashboard for small retailers

---

## 🎯 DEVELOPMENT GUIDELINES

### Code Style
- Use TypeScript strict mode
- Follow Shadcn/UI component patterns
- Implement proper error boundaries
- Add comprehensive logging for debugging

### Performance Targets
- YOLO inference: <100ms per frame on GPU devices
- Product recognition: >95% accuracy on known SKUs
- Sync latency: <5 seconds on stable connection
- Offline mode: Graceful degradation with full functionality

### Testing Strategy
- Unit tests for GST calculations (critical for compliance)
- Integration tests for database operations
- E2E tests for critical user flows (payment, sync)
- Visual regression tests for UI components

---

## 🔧 DEVELOPMENT WORKFLOW

### Phase 1: Foundation (Current)
- UI framework setup (Shadcn/UI + Tailwind)
- Database schema with audit trails
- Basic authentication with RLS

### Phase 2: Core POS Features
- Manual barcode scanning (before AI implementation)
- Shopping cart with GST calculation
- Transaction recording with digital signatures
- Basic inventory management

### Phase 3: Vision AI Integration
- YOLO26 model integration
- Product embedding database
- Camera canvas with bounding box overlay
- Face-ID authentication (opt-in)

### Phase 4: Advanced Features
- Offline sync with conflict resolution
- WhatsApp PDF generation
- Supply chain integrations
- Predictive restocking

---

## 🚨 COMMON PITFALLS TO AVOID

### ❌ DON'T
- Use OCR for payment verification (implement mBoB/mPay APIs instead)
- Store Face-ID embeddings without explicit consent
- Ignore Row-Level Security for multi-tenant data
- Skip audit trail logging for compliance
- Assume 4K processing will work on all devices
- Implement credit limits as application logic only (use database constraints)

### ✅ DO  
- Plan for graceful degradation (WebGPU → WASM → CPU)
- Implement comprehensive conflict resolution for offline sync
- Add performance monitoring from day one
- Design for low-literacy users (icons over text)
- Consider Bhutan's connectivity challenges (offline-first)
- Plan for power outages (battery backup mode)

---

## 📞 CRITICAL INTEGRATIONS NEEDED

### High Priority (Launch Blockers)
1. **mBoB Merchant API** - Real-time transaction verification
2. **mPay Payment Gateway** - Direct payment processing  
3. **Bhutan GST Portal API** - Automated tax filing
4. **Supabase RLS** - Data isolation enforcement

### Medium Priority (Feature Complete)
1. **WhatsApp Business API** - PDF receipt delivery
2. **Toofan/Rider APIs** - Last-mile logistics
3. **Bank RTGS Verification** - High-value transaction processing

---

## 🎨 ROYAL BHUTAN THEME CONFIGURATION

### Tailwind Extension
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        obsidian: '#0F172A',
        gold: '#D4AF37', 
        emerald: '#10B981',
        tibetan: '#EF4444',
      },
      fontFamily: {
        sans: ['Noto Sans', 'sans-serif'],
        serif: ['Noto Serif', 'serif'],
      },
      backdropBlur: {
        xs: '2px',
      }
    }
  }
}
```

### Component Customization
- Use Shadcn base components as foundation
- Apply Royal Bhutan tokens via CSS variables
- Implement glassmorphism with `backdrop-blur-xl bg-slate-900/40`
- Use Framer Motion for physics-based animations

---

## 📊 KEY PERFORMANCE INDICATORS

### Technical Metrics
- YOLO inference time (target: <100ms)
- Product recognition accuracy (target: >95%)
- Sync success rate (target: >99%)
- Offline mode uptime (target: 100% functionality)

### Business Metrics  
- GST compliance accuracy (target: 100%)
- Transaction processing time (target: <30s)
- Inventory reconciliation accuracy (target: >99%)
- Customer Face-ID adoption rate (measure opt-ins)

---

**Last Updated**: 2026-04-06  
**Architecture Version**: 1.0  
**Status**: Foundation Phase - UI Framework Setup  
**Next Milestone**: Shadcn/UI Component Library Integration