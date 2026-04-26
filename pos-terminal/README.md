# NEXUS BHUTAN — Offline POS (PocketBase)

A focused, offline-first Point of Sale system for Bhutanese retail. Runs entirely on a local PocketBase instance — no internet required for daily operations.

## 🏔️ Features

- **100% Offline** — Local SQLite database via PocketBase. No connectivity gate.
- **Barcode / QR Scanning** — Browser-based camera scanning with `html5-qrcode`.
- **Full GST Compliance** — 5% flat rate, digital signatures, compliant receipts.
- **Inventory Management** — Real-time stock tracking, low-stock alerts, adjustments.
- **Credit / Khata Ledger** — Customer credit tracking with limits and repayments.
- **End-of-Day Reports** — Order history, refunds, payment breakdowns.
- **Multi-Role Auth** — Owner, Manager, Cashier roles with permission gating.
- **Print Receipts** — Browser print + PDF-ready receipt layout.
- **Responsive Design** — Works on desktop, tablet, and mobile.

## 🚀 Quick Start

### 1. Start PocketBase

Download the PocketBase binary for your platform from [pocketbase.io](https://pocketbase.io/docs/).

```bash
# Linux / macOS
chmod +x pocketbase
./pocketbase serve

# Windows
pocketbase.exe serve
```

PocketBase will start on `http://127.0.0.1:8090`. The admin UI is at `http://127.0.0.1:8090/_/admin`.

### 2. Apply Schema Migration

Copy the migration file into PocketBase:

```bash
cp pb/pb_migrations/001_initial_schema.js ./pb_migrations/
```

Restart PocketBase to apply the migration and seed data.

### 3. Run the POS App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with:
- **Email**: `admin@pos.local`
- **Password**: `admin123`

## 📁 Project Structure

```
pos-terminal/
├── pb/
│   └── pb_migrations/
│       └── 001_initial_schema.js    # PocketBase schema + seed data
├── app/
│   ├── page.tsx                     # Main POS (split-view)
│   ├── login/page.tsx               # Auth login
│   ├── inventory/page.tsx           # Stock management
│   ├── orders/page.tsx              # Order history
│   ├── customers/page.tsx           # Customer / Khata
│   └── settings/page.tsx            # Store profile
├── components/
│   ├── pos/
│   │   ├── product-grid.tsx         # Category-filtered product browse
│   │   ├── cart-panel.tsx           # Cart with totals & checkout
│   │   ├── barcode-scanner.tsx      # Camera-based barcode/QR scan
│   │   ├── payment-modal.tsx        # Cash / Digital / Credit payment
│   │   ├── customer-modal.tsx       # Select / create customer
│   │   └── receipt-modal.tsx        # Print-ready receipt
│   └── ui/                          # Shadcn/UI components
├── hooks/
│   ├── use-auth.ts                  # PocketBase auth state
│   ├── use-products.ts              # Product catalog + barcode lookup
│   ├── use-cart.ts                  # Active cart management
│   ├── use-orders.ts                # Order history & refunds
│   ├── use-customers.ts             # Customer & khata ledger
│   └── use-settings.ts              # Store profile settings
├── lib/
│   ├── pb-client.ts                 # PocketBase SDK singleton
│   └── gst.ts                       # Bhutan GST 2026 calculations
└── next.config.mjs
```

## 🔌 PocketBase Collections

| Collection | Purpose |
|-----------|---------|
| `users` | Cashiers, Managers, Owners (built-in auth) |
| `products` | Catalog with barcode, stock, MRP, HSN code |
| `categories` | Product categories |
| `customers` | Customer profiles with credit limit / balance |
| `carts` | Active shopping session |
| `cart_items` | Line items in active cart |
| `orders` | Confirmed sales with immutable item snapshot |
| `inventory_movements` | Stock changes (sale, restock, loss, damaged) |
| `khata_transactions` | Credit ledger (debit/credit/adjustment) |
| `settings` | Store name, TPN/GSTIN, receipt text, GST rate |

## 🧾 GST Calculation

Bhutan GST 2026 — flat 5% on taxable (discounted) amount:

```
taxable = unit_price - discount
gst     = taxable * 0.05 * quantity
total   = taxable * 1.05 * quantity
```

## 📡 Sync to Central Server (Optional)

For multi-store or cloud backup scenarios, configure a background sync worker to push orders and pull product catalog updates from a central PocketBase instance. This is **not required** for single-terminal offline operation.

## 🔒 Security

- PocketBase auth with password + JWT sessions
- Role-based UI gating (Owner / Manager / Cashier)
- Immutable order snapshots for audit compliance
- SHA-256 digital signatures on every receipt

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + Shadcn/UI |
| Backend | PocketBase (Go binary, SQLite) |
| Barcode | `html5-qrcode` |
| Receipt | Native browser print dialog |

## 📝 License

Proprietary — btGST-edgePOS / NEXUS BHUTAN
