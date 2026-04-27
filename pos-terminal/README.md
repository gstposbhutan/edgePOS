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
- **Print Receipts** — Browser print + thermal printer via Electron.
- **Responsive Design** — Works on desktop, tablet, and mobile.

## 🚀 Quick Start

### Option A — Docker (Recommended)

Everything runs in containers. No local Node.js or PocketBase binary required.

```bash
cd pos-terminal

# Production stack — builds static app + runs PocketBase
docker compose up -d

# Open http://localhost:3000 and sign in:
# Email: admin@pos.local
# Password: admin12345
```

The setup container runs automatically on first start. Data persists in the `pb_data` Docker volume.

For development with hot reload:

```bash
docker compose -f docker-compose.dev.yml up -d
# Then run setup manually:
docker compose -f docker-compose.dev.yml exec pos npm run pb:setup
```

### Option B — Local Development

#### 1. Install dependencies

```bash
cd pos-terminal
npm install
```

#### 2. Start PocketBase

The PocketBase binary is already included at `pos-terminal/pb/pocketbase`. Start it with:

```bash
npm run pb:serve
```

This starts PocketBase on `http://127.0.0.1:8090`, auto-applies migrations, and creates the default superuser.

#### 3. Run setup

One-time setup to configure the `users` collection and seed demo data:

```bash
npm run pb:setup
```

#### 4. Run the POS App

```bash
# Browser mode
npm run dev

# Desktop mode (Electron + embedded PocketBase)
npm run electron:dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with:
- **Email**: `admin@pos.local`
- **Password**: `admin12345`

## 🖨️ Thermal Printer Setup (Optional)

Thermal printing requires native USB drivers. These are **not installed by default** to avoid system dependency issues.

### Ubuntu / Debian

```bash
sudo apt-get install libudev-dev
npm install escpos escpos-usb usb
```

### macOS

```bash
brew install libusb
npm install escpos escpos-usb usb
```

### Windows

Install [Zadig](https://zadig.akeo.ie/) and replace your printer's driver with WinUSB. Then:

```bash
npm install escpos escpos-usb usb
```

After installing, restart the Electron app. The Settings page will show "Connected" if a USB thermal printer is detected.

## 🖥️ Desktop App (Electron)

The Electron shell auto-launches PocketBase as a subprocess and provides:
- **System tray** — minimize-to-tray behavior
- **ESC/POS printing** — direct USB thermal printer access
- **Background sync** — push orders to a central server
- **LAN mode** — connect to a shared PocketBase instance

### Build distributable

```bash
npm run electron:pack    # Local package
npm run electron:build   # Full installer
```

## 📁 Project Structure

```
pos-terminal/
├── electron/
│   ├── main.js              # Electron lifecycle + PB launcher + IPC
│   ├── preload.js           # Secure context bridge
│   ├── pb-launcher.js       # PocketBase subprocess + health check
│   └── printer.js           # ESC/POS USB thermal printer
├── pb/
│   └── pb_migrations/
│       ├── 001_initial_schema.js    # Core collections
│       └── 002_shifts.js            # Shift records for Z-Report
├── app/
│   ├── page.tsx             # Main POS (split-view)
│   ├── login/page.tsx       # Auth login
│   ├── inventory/page.tsx   # Stock management
│   ├── orders/page.tsx      # Order history
│   ├── customers/page.tsx   # Customer / Khata
│   └── settings/page.tsx    # Store profile + printer + sync + LAN
├── components/
│   ├── pos/
│   │   ├── product-grid.tsx
│   │   ├── cart-panel.tsx
│   │   ├── barcode-scanner.tsx
│   │   ├── payment-modal.tsx
│   │   ├── customer-modal.tsx
│   │   ├── receipt-modal.tsx
│   │   └── z-report-modal.tsx
│   └── ui/                  # Shadcn/UI components
├── hooks/
│   ├── use-auth.ts
│   ├── use-products.ts
│   ├── use-cart.ts
│   ├── use-orders.ts
│   ├── use-customers.ts
│   ├── use-settings.ts
│   ├── use-shifts.ts        # Shift open/close + Z-Report
│   └── use-platform.ts      # Detect Electron vs Web
├── lib/
│   ├── pb-client.ts         # PocketBase SDK singleton
│   └── gst.ts               # Bhutan GST 2026 calculations
└── package.json
```

## 🔌 PocketBase Collections

| Collection | Purpose |
|-----------|---------|
| `users` | Cashiers, Managers, Owners (built-in auth) |
| `products` | Catalog with barcode, stock, MRP, HSN code |
| `categories` | Product categories |
| `customers` | Customer profiles with credit limit / balance |
| `carts` / `cart_items` | Active shopping session |
| `orders` | Confirmed sales with immutable item snapshot |
| `inventory_movements` | Stock changes (sale, restock, loss, damaged) |
| `khata_transactions` | Credit ledger (debit/credit/adjustment) |
| `shifts` | Cashier shift records for Z-Report |
| `settings` | Store name, TPN/GSTIN, receipt text, GST rate |

## 🧾 GST Calculation

Bhutan GST 2026 — flat 5% on taxable (discounted) amount:

```
taxable = unit_price - discount
gst     = taxable * 0.05 * quantity
total   = taxable * 1.05 * quantity
```

## 📡 Sync to Central Server (Optional)

For multi-store or cloud backup scenarios:

1. Go to **Settings → Central Sync**
2. Enter your remote PocketBase URL and API key
3. Set sync interval (minutes)
4. Click **Start Sync**

The background worker will push local orders and mark them as synced automatically.

## 🌐 Multi-Terminal LAN Mode

For shops with multiple POS terminals:

1. Designate one computer as the **server** — run PocketBase there
2. Find the server's local IP (e.g., `192.168.1.100`)
3. On each terminal, go to **Settings → PocketBase Server**
4. Enter: `http://192.168.1.100:8090`
5. All terminals now share the same database in real-time

## 🔒 Security

- PocketBase auth with password + JWT sessions
- Role-based UI gating (Owner / Manager / Cashier)
- Immutable order snapshots for audit compliance
- SHA-256 digital signatures on every receipt

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 + React 19 + TypeScript |
| **Styling** | Tailwind CSS v4 + Shadcn/UI |
| **Backend** | PocketBase (Go binary, SQLite) |
| **Desktop** | Electron |
| **Barcode** | `html5-qrcode` |
| **Receipt** | Browser print + ESC/POS (optional) |

## 📝 License

Proprietary — btGST-edgePOS / NEXUS BHUTAN
