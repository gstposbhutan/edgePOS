# Feature: Desktop Application Shell

**Feature ID**: F-DESKTOP-001
**Phase**: 1 (Foundation)
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

The POS terminal runs as a native Windows desktop application built on Electron. This shell provides the bridge between the browser-based React UI and the physical hardware found in Bhutanese retail environments — thermal printers, cash drawers, dual cameras, and local storage. Without this layer, the POS cannot interact with store peripherals or guarantee data persistence during connectivity outages.

The shell is intentionally thin. All business logic, GST calculations, and UI rendering live in the shared React component library. Electron's main process handles only what the browser sandbox cannot: hardware I/O, filesystem access, native window management, and the embedded database. This separation ensures the same React codebase renders identically whether loaded in an Electron BrowserWindow or accessed as a PWA from a browser tab.

A single-instance lock prevents multiple POS windows from running concurrently. On close, the window minimizes to the system tray rather than quitting — the POS stays available for quick access throughout the business day. Auto-start on Windows boot and background auto-update via `electron-updater` ensure the terminal is always ready and current without manual intervention from store staff.

---

## Electron Shell Architecture

### Main Process Responsibilities

| Responsibility | Library / API | Notes |
|---|---|---|
| Window lifecycle | `BrowserWindow` | Single window, frameless, kiosk-adjacent |
| System tray | `Tray` + native icon | Minimize-to-tray on close, not quit |
| Single instance | `app.requestSingleInstanceLock()` | Second launch focuses existing window |
| Auto-start | `app.setLoginItemSettings()` | Registered on first run |
| Auto-update | `electron-updater` | GitHub Releases or S3 bucket, background download + notify |
| Hardware I/O | IPC handlers | Printer, cash drawer, cameras — all in main process |
| Local database | `better-sqlite3` | Embedded, zero-config, synchronous API |

### Window Management

```
App launch
  → Single instance lock acquired
  → BrowserWindow created (frameless, 1920x1080 minimum)
  → React app loaded (file:// for production, dev server for development)
  → Tray icon created with context menu: Show | Settings | Quit

User clicks window close button (X)
  → Intercepted via 'close' event
  → window.hide() instead of destroying
  → App lives in system tray
  → Tray click or tray "Show" → window.show()

Second app launch attempted
  → Single instance lock fires 'second-instance'
  → Existing window restored and focused
  → Second instance exits immediately
```

### Auto-Update Flow

```
App starts
  → electron-updater checks remote for new version
  → New version found → background download begins
  → Download complete → tray notification "Update available"
  → User clicks "Install & Restart" (or forced on next launch)
  → quitAndInstall() applies update
  → No manual download or installer execution required
```

Update source: GitHub Releases (public) or a private S3 bucket. Delta updates enabled where supported to minimize download size on Bhutanese internet connections.

---

## Embedded SQLite Database

### Why SQLite (Not IndexedDB / localStorage)

IndexedDB is browser-scoped, async, and difficult to query with relational logic. The POS needs synchronous, transactional, relational data access for GST-compliant order recording. `better-sqlite3` provides:

- Synchronous API — no callback hell, deterministic execution order for financial transactions
- Full SQL — relational queries across products, orders, inventory without manual joins in code
- WAL mode — concurrent reads during writes, no UI blocking
- Zero config — single file on disk, no separate process, survives OS crashes with ACID guarantees
- Easy backup — copy the `.db` file

### Local Schema

The local SQLite schema mirrors the Supabase core tables required for offline POS operation. Not every cloud table is replicated locally — only what the POS terminal needs to function.

#### `schema_version` (Migration Tracking)

```sql
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT DEFAULT (datetime('now')),
  description TEXT
);
```

Every migration increments `version`. On startup, the app reads the current version and runs any pending migrations inside a transaction. If a migration fails, the database is rolled back and the app refuses to start with a clear error message.

#### `products`

```sql
CREATE TABLE products (
  id                TEXT PRIMARY KEY,          -- UUID matching Supabase
  name              TEXT NOT NULL,
  hsn_code          TEXT,
  barcode           TEXT,
  unit              TEXT DEFAULT 'PCS',
  purchase_price    REAL NOT NULL DEFAULT 0,   -- Cost price (Wholesaler → Retailer)
  retail_price      REAL NOT NULL DEFAULT 0,   -- Selling price
  mrp               REAL NOT NULL DEFAULT 0,   -- Maximum Retail Price (regulated)
  gst_rate          REAL NOT NULL DEFAULT 5.0, -- Percentage (flat 5% for Bhutan)
  stock             INTEGER NOT NULL DEFAULT 0,
  image_embedding   BLOB,                      -- Float32 array for visual matching
  category_id       TEXT,
  sync_status       TEXT DEFAULT 'SYNCED' CHECK (sync_status IN ('SYNCED','PENDING','CONFLICT')),
  updated_at        TEXT DEFAULT (datetime('now'))
);
```

#### `orders`

```sql
CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  order_no          TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  seller_id         TEXT NOT NULL,
  buyer_id          TEXT,                      -- NULL for anonymous
  buyer_phone       TEXT,
  buyer_hash        BLOB,                      -- Face-ID embedding
  subtotal          REAL NOT NULL DEFAULT 0,
  gst_total         REAL NOT NULL DEFAULT 0,
  grand_total       REAL NOT NULL DEFAULT 0,
  payment_method    TEXT CHECK (payment_method IN ('MBOB','MPAY','RTGS','CASH','CREDIT')),
  payment_ref       TEXT,
  payment_verified_at TEXT,
  digital_signature TEXT,
  created_by        TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  completed_at      TEXT,
  sync_status       TEXT DEFAULT 'PENDING'
);
```

#### `order_items`

```sql
CREATE TABLE order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  rate        REAL NOT NULL,
  discount    REAL NOT NULL DEFAULT 0,
  gst_amount  REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL,
  status      TEXT DEFAULT 'ACTIVE'
);
```

#### `inventory`

```sql
CREATE TABLE inventory (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  adjustment  INTEGER NOT NULL,               -- Positive = restock, Negative = sale/loss
  reason      TEXT NOT NULL,                   -- SALE, RESTOCK, TRANSFER, LOSS, DAMAGED
  reference   TEXT,                            -- order_id or transfer_id
  created_at  TEXT DEFAULT (datetime('now'))
);
```

#### `cart` + `cart_items`

```sql
CREATE TABLE cart (
  id          TEXT PRIMARY KEY DEFAULT 'ACTIVE',
  buyer_id    TEXT,
  buyer_phone TEXT,
  buyer_hash  BLOB,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE cart_items (
  id          TEXT PRIMARY KEY,
  cart_id     TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  rate        REAL NOT NULL,
  discount    REAL NOT NULL DEFAULT 0,
  gst_amount  REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL
);
```

### Migration System

```
/app/main/db/
  ├── migrations/
  │     ├── 001_initial_schema.sql
  │     ├── 002_add_barcode_index.sql
  │     └── ...
  ├── migrate.js          -- Reads schema_version, runs pending migrations
  └── connection.js       -- Opens better-sqlite3, enables WAL mode, returns db instance
```

Startup sequence:

1. Open SQLite connection with WAL mode enabled
2. Read current `schema_version`
3. List migration files in `migrations/` directory sorted numerically
4. Run each migration with version > current inside a single transaction
5. If all succeed, update `schema_version`
6. If any fail, roll back and halt with error log

### Sync Boundary

Local SQLite is the **source of truth** for POS operations. Supabase is the source of truth for product catalog, entity management, and cross-store reporting. The sync-worker (separate service) reconciles between the two:

- **Local → Cloud**: New orders, inventory adjustments, buyer records are pushed when online
- **Cloud → Local**: Product catalog updates, price changes, new product additions are pulled
- Conflict resolution strategy is defined in the sync-worker spec (separate feature doc)

---

## Dual-Camera Hardware Routing

### Camera Assignments

| Camera | Purpose | Typical Hardware |
|---|---|---|
| Overhead / Downward | Product recognition (YOLO26) | USB webcam mounted above counter pointing down |
| Front-facing | Payment OCR, Face-ID | USB webcam or built-in laptop camera facing cashier/customer |

### Camera Selection Strategy

Browser `navigator.mediaDevices.enumerateDevices()` lists available cameras but does not guarantee consistent ordering across sessions. The desktop shell solves this with persistent device assignment:

1. On first launch, enumerate all video input devices (DirectShow on Windows)
2. Present a setup screen: "Select overhead camera" and "Select front camera"
3. Store device IDs in local config (`electron-store` or SQLite `settings` table)
4. On subsequent launches, match stored device IDs to enumerated devices
5. If a stored device is missing (disconnected), show a hardware warning banner in the UI
6. Camera streams are opened in the main process using native APIs and piped to the renderer via `MediaStream` constraints

### IPC Channels

| Channel | Direction | Payload |
|---|---|---|
| `camera:get-overhead-stream` | Renderer → Main | Returns MediaStream constraints with exact device ID |
| `camera:get-front-stream` | Renderer → Main | Returns MediaStream constraints with exact device ID |
| `camera:list-devices` | Renderer → Main | Returns array of `{deviceId, label, kind}` |
| `camera:assign-device` | Renderer → Main | `{role: 'overhead' | 'front', deviceId}` |
| `camera:status` | Main → Renderer | `{overhead: 'connected' | 'missing', front: 'connected' | 'missing'}` |

---

## ESC/POS Thermal Printer Driver

### Requirements

- Raw ESC/POS commands sent directly to the printer — no Windows print spooler dialog
- Supports 80mm thermal printers (standard in Bhutanese retail)
- Connection via USB (most common), with optional network/LAN support
- Print speed: receipt must begin printing within 500ms of transaction completion

### Print Content

- Store name, address, TPN/GSTIN
- Invoice number and date/time
- Line items: name, qty, rate, GST, total per item
- Subtotal, GST total (5%), grand total
- Payment method
- Digital signature (SHA-256 hash)
- WhatsApp delivery status line

### Implementation

Uses `node-escpos` (or `escpos` npm package) with USB adapter:

```
/app/main/hardware/
  ├── printer.js           -- ESC/POS command builder + USB connection
  ├── receipt-template.js  -- Receipt layout formatter
  └── usb-devices.js       -- USB device enumeration and matching
```

### IPC Channels

| Channel | Direction | Payload |
|---|---|---|
| `printer:print-receipt` | Renderer → Main | `{orderId, orderNo, items, totals, payment}` |
| `printer:test-print` | Renderer → Main | None — prints test pattern |
| `printer:status` | Main → Renderer | `{connected: bool, model: string, paperStatus: string}` |
| `printer:select-device` | Renderer → Main | `{vendorId, productId}` |

### Printer Setup Flow

```
First launch or settings page
  → Enumerate USB devices
  → Filter for known printer vendor/product IDs
  → If exactly one found → auto-select
  → If multiple or none → show selection/setup screen
  → Store printer device info in local config
  → Test print on selection to confirm
```

---

## Cash Drawer Kick

### Trigger Rules

- Fires automatically when a CASH payment transaction is marked COMPLETED
- Does NOT fire on digital payments (MBOB, mPay, RTGS) unless explicitly configured
- Manual open button available to MANAGER+ roles (requires reason input)

### Connection Methods

1. **Printer relay (primary)**: Cash drawer connects to the thermal printer's DK (drawer kick) port. ESC/POS command `ESC p m t1 t2` fires the kick signal through the printer. This is the standard setup in Bhutan — no extra USB port needed.
2. **Direct USB (fallback)**: For drawers connected directly to the PC. Uses `node-hid` or `serialport` to send the kick command. Device-specific configuration required.

### Implementation

```javascript
// printer.js (inside main process)
function kickCashDrawer(printer) {
  // ESC/POS drawer kick command
  // ESC p 0 100 100 — pulse pin 2 for 100ms on, 100ms off
  printer.write([0x1B, 0x70, 0x00, 0x64, 0x64]);
}
```

### IPC Channels

| Channel | Direction | Payload |
|---|---|---|
| `drawer:open` | Renderer → Main | `{reason: 'cash_transaction' | 'manual', orderId?}` |
| `drawer:status` | Main → Renderer | `{connected: bool, method: 'printer_relay' | 'usb'}` |

---

## Shared React UI with Platform Detection

### Architecture

The React component library is shared across both the Electron desktop app and the browser-based PWA. Platform-specific behavior is gated behind a `usePlatform()` hook:

```javascript
// usePlatform.js
function usePlatform() {
  const [platform, setPlatform] = useState('web');

  useEffect(() => {
    if (window.electronAPI) {
      setPlatform('electron');
    }
  }, []);

  return {
    isElectron: platform === 'electron',
    isWeb: platform === 'web',
    hardware: platform === 'electron' ? window.electronAPI : null,
  };
}
```

### Conditional Rendering Rules

| Component | Electron | PWA (Browser) |
|---|---|---|
| Keyboard shortcut overlay (F1-F12) | Shown | Hidden |
| Hardware status bar (printer, camera, drawer) | Shown | Hidden |
| Auto-update notification banner | Shown | Hidden |
| System tray menu | Shown | N/A |
| Printer selection in settings | Native USB picker | Browser print dialog |
| Camera selection in settings | Native device picker | Browser permission prompt |
| Cash drawer open button | Visible to MANAGER+ | Hidden |

---

## IPC Bridge Architecture

### Security Model

Electron's `contextBridge` exposes a strictly defined API surface to the renderer process. No direct access to `require`, `fs`, `child_process`, or any Node.js APIs from the React layer.

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Camera
  camera: {
    listDevices:    () => ipcRenderer.invoke('camera:list-devices'),
    assignDevice:   (args) => ipcRenderer.invoke('camera:assign-device', args),
    getOverhead:    () => ipcRenderer.invoke('camera:get-overhead-stream'),
    getFront:       () => ipcRenderer.invoke('camera:get-front-stream'),
    onStatusChange: (cb) => ipcRenderer.on('camera:status', (_, data) => cb(data)),
  },

  // Printer
  printer: {
    printReceipt:   (args) => ipcRenderer.invoke('printer:print-receipt', args),
    testPrint:      () => ipcRenderer.invoke('printer:test-print'),
    onStatusChange: (cb) => ipcRenderer.on('printer:status', (_, data) => cb(data)),
    selectDevice:   (args) => ipcRenderer.invoke('printer:select-device', args),
  },

  // Cash drawer
  drawer: {
    open:           (args) => ipcRenderer.invoke('drawer:open', args),
    onStatusChange: (cb) => ipcRenderer.on('drawer:status', (_, data) => cb(data)),
  },

  // Database (read-only surface for renderer)
  db: {
    query:          (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    run:            (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  },

  // App lifecycle
  app: {
    getVersion:     () => ipcRenderer.invoke('app:get-version'),
    onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_, info) => cb(info)),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', () => cb()),
    installUpdate:  () => ipcRenderer.invoke('update:install'),
  },
});
```

### IPC Design Rules

- All hardware calls use `ipcRenderer.invoke()` / `ipcMain.handle()` (request-response, promise-based)
- Status updates use `ipcRenderer.on()` / `mainWindow.webContents.send()` (push-based, event-driven)
- No `sendSync` — all IPC is asynchronous to prevent UI freezing
- All payloads are validated with Zod schemas in the main process before execution
- The renderer never receives raw file paths, device handles, or system credentials

---

## Directory Structure

```
/apps/desktop/
  ├── electron/
  │   ├── main.js              -- App lifecycle, window, tray, single instance
  │   ├── preload.js           -- contextBridge API surface
  │   ├── updater.js           -- electron-updater configuration and flow
  │   ├── db/
  │   │   ├── connection.js    -- better-sqlite3 setup, WAL mode
  │   │   ├── migrate.js       -- Migration runner
  │   │   └── migrations/
  │   │       ├── 001_initial_schema.sql
  │   │       ├── 002_add_indexes.sql
  │   │       └── ...
  │   └── hardware/
  │       ├── printer.js       -- ESC/POS command builder + USB connection
  │       ├── receipt-template.js
  │       ├── cash-drawer.js   -- Drawer kick via printer relay or USB
  │       ├── camera.js        -- Device enumeration, assignment, stream setup
  │       └── usb-devices.js   -- Shared USB device listing
  ├── src/                     -- React UI (shared with PWA)
  │   ├── components/
  │   ├── hooks/
  │   │   └── usePlatform.js   -- Platform detection hook
  │   └── ...
  └── package.json
```

---

## Implementation Checklist

### Electron Shell
- [ ] Initialize Electron main process with BrowserWindow (frameless, minimum 1920x1080)
- [ ] Implement single instance lock (`app.requestSingleInstanceLock`)
- [ ] Implement system tray icon with context menu (Show, Settings, Quit)
- [ ] Intercept window close event → hide to tray instead of quit
- [ ] Register auto-start on Windows boot via `app.setLoginItemSettings`
- [ ] Set up `electron-updater` with background download and restart prompt
- [ ] Configure `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [ ] Write `preload.js` with `contextBridge` API surface

### Embedded Database
- [ ] Integrate `better-sqlite3` in main process
- [ ] Enable WAL mode on connection open
- [ ] Create migration runner (`migrate.js`) with `schema_version` tracking
- [ ] Write migration `001_initial_schema.sql` (products, orders, order_items, inventory, cart, cart_items)
- [ ] Write migration `002_add_indexes.sql` (order_no unique, product barcode, sync_status)
- [ ] Implement `db:query` and `db:run` IPC handlers with input validation
- [ ] Add database file path configuration (default: `%APPDATA%/nexus-pos/local.db`)
- [ ] Test migration rollback on failure (app refuses to start with clear error)

### Camera Routing
- [ ] Implement USB camera enumeration via DirectShow / `navigator.mediaDevices`
- [ ] Build camera setup screen (select overhead + front camera)
- [ ] Persist camera device assignments in local config
- [ ] Implement `camera:get-overhead-stream` and `camera:get-front-stream` IPC handlers
- [ ] Add hardware warning banner when assigned camera is disconnected
- [ ] Implement `camera:status` push notification on device connect/disconnect

### Thermal Printer
- [ ] Integrate `node-escpos` with USB adapter
- [ ] Build receipt template formatter (store info, items, GST breakdown, signature)
- [ ] Implement `printer:print-receipt` IPC handler
- [ ] Implement printer auto-detection on first launch
- [ ] Implement `printer:test-print` for setup verification
- [ ] Add `printer:status` monitoring (connected, paper status)
- [ ] Handle printer disconnection gracefully (queue receipt, retry on reconnect)

### Cash Drawer
- [ ] Implement ESC/POS drawer kick command via printer relay
- [ ] Implement `drawer:open` IPC handler (auto on CASH completion, manual for MANAGER+)
- [ ] Add manual open button with reason input (MANAGER+ only, logged to audit)
- [ ] Implement direct USB fallback using `node-hid` or `serialport`

### Shared UI Platform Layer
- [ ] Implement `usePlatform()` hook (Electron vs browser detection)
- [ ] Build `<HardwareStatusBar>` component (printer, camera, drawer indicators)
- [ ] Build `<KeyboardShortcuts>` component (F-key overlay, Electron only)
- [ ] Gate all hardware IPC calls behind `isElectron` check
- [ ] Ensure PWA graceful degradation when `window.electronAPI` is undefined

### Build and Packaging
- [ ] Configure `electron-builder` for Windows NSIS installer
- [ ] Set up GitHub Releases or S3 as auto-update source
- [ ] Enable delta updates for smaller downloads
- [ ] Add application icon and installer branding (Royal Bhutan theme)
- [ ] Test clean install, update, and uninstall flows on Windows 10/11

---

## Resolved Decisions

**Q: Why Electron instead of Tauri or a native desktop framework?**
A: **Electron** is the pragmatic choice because the POS UI is built in React. Electron runs the exact same React codebase in a BrowserWindow with full Node.js access for hardware I/O. Tauri would require Rust for the main process (added complexity, smaller ecosystem for hardware libs like `node-escpos`). Native (C#/WPF) would require a complete separate UI codebase. The tradeoff is larger binary size (~150MB) which is acceptable for a fixed POS terminal.

**Q: Why better-sqlite3 instead of sql.js (WASM) or IndexedDB?**
A: **better-sqlite3** is a native Node.js binding to SQLite — fastest possible performance for a POS that writes financial transactions synchronously. sql.js runs SQLite in WASM (slower, memory-only by default, no WAL). IndexedDB is async, non-relational, and painful for multi-table queries needed for GST calculations. The native binding overhead is acceptable since Electron already ships a Node.js runtime.

**Q: Should the local SQLite database be encrypted?**
A: **Not at this stage.** The POS terminal is a dedicated device in a physical store. Full-disk encryption (BitLocker) at the OS level is the recommended approach for data-at-rest protection. SQLCipher adds significant complexity and performance overhead. If regulatory requirements change, SQLCipher can be added as a migration step (better-sqlite3 does not support it, but `@libsql/client` does).

**Q: How are camera device IDs persisted across sessions?**
A: **Stored in local config (electron-store or SQLite settings table).** On Windows, DirectShow device paths can be stable across reboots but may change when USB ports are swapped. The setup screen is re-shown if a stored device ID no longer matches any enumerated device. A "Reconfigure Hardware" option is always available in settings.

**Q: What happens if the printer fails mid-receipt?**
A: **The order is already recorded in SQLite before the print command is issued.** The print job is queued with a retry mechanism. If the printer is disconnected, the receipt is held in a local print queue and automatically reprinted when the printer reconnects. The cashier sees a "Receipt pending" indicator and can manually trigger a reprint at any time.
