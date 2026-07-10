const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { launchPocketBase, PB_URL } = require("./pb-launcher");
const { printReceipt, getPrinterStatus, testPrint, listPrinters } = require("./printer");
const { kickDrawer } = require("./drawer");
const { startStaticServer } = require("./static-server");
const { verifyLicense } = require("./license");
const { checkLicense, saveLicense } = require("./license-store");
const { DEFAULT_CLOUD_URL } = require("./config");
const { fetchLatestRelease } = require("./update-checker");

const isDev = !app.isPackaged;
// Dev affordance: serve the already-built `out/` via the static server (port APP_PORT) instead
// of the renderer dev server on :3000 — useful when :3000 is taken by another app.
const serveBuilt = process.env.NEXUS_SERVE_BUILT === "1";
const APP_PORT = 3200;
let staticServer = null;
let mainWindow = null;
let activationWindow = null;
let tray = null;
let pbProcess = null;
let syncInterval = null;
let bootstrapInterval = null;
let syncDebounce = null;
let syncConfig = null;
// Terminal mode from the license / bootstrap: "POS" rings cash sales; "BACK_OFFICE" is a
// stock-only terminal (stock + online orders, no cash sale). Default POS for older licenses.
let terminalMode = "POS";
let pbDataDir = null;
let lastSyncAt = null; // ISO time of the last successful push/pull — drives the renderer sync nudge
let onlineOrdersInterval = null;
let onlineOrdersPrimed = false; // suppress the notification storm on the first poll after launch
let b2bOrdersInterval = null;
let b2bOrdersPrimed = false;    // same, for incoming B2B (wholesale) orders

function getResourcePath(...segments) {
  if (isDev) return path.join(__dirname, "..", ...segments);
  return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "Pelbu POS",
    icon: getResourcePath("public", "favicon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev && !serveBuilt) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${APP_PORT}`);
  }

  // After the UI loads, check the cloud for a newer release and tell the renderer.
  mainWindow.webContents.once("did-finish-load", async () => {
    const release = await fetchLatestRelease();
    if (release && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:available", release);
    }
  });

  mainWindow.on("close", (event) => {
    if (process.platform === "darwin") return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  try {
    tray = new Tray(getResourcePath("public", "favicon.png"));
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show", click: () => mainWindow.show() },
      { label: "Test Printer", click: async () => {
        try { await testPrint(mainWindow, { printer_paper_width: 80 }); } catch (e) { dialog.showErrorBox("Printer", e.message); }
      }},
      { type: "separator" },
      { label: "Quit", click: () => {
        if (pbProcess) pbProcess.kill();
        app.exit(0);
      }},
    ]);
    tray.setToolTip("Pelbu POS");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => mainWindow.show());
  } catch (e) {
    console.warn("[Main] Tray creation failed:", e.message);
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle("printer:list", async () => listPrinters(mainWindow));

ipcMain.handle("printer:get-status", async (_, settings) => getPrinterStatus(mainWindow, settings));

ipcMain.handle("printer:print", async (_, order, settings) => {
  try {
    await printReceipt(mainWindow, order, settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("printer:test", async (_, settings) => {
  try {
    await testPrint(mainWindow, settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Pop the cash drawer (raw ESC/POS kick to the receipt printer). Windows-only; no-op elsewhere.
ipcMain.handle("printer:kick-drawer", async (_, settings) => kickDrawer(mainWindow, settings));

ipcMain.handle("app:get-version", () => app.getVersion());

// Terminal mode (POS vs BACK_OFFICE) from the license / bootstrap — gates the renderer UI so a
// back-office terminal never rings a cash sale. Refreshed live via the "terminal:mode" event.
ipcMain.handle("terminal:get-mode", () => terminalMode);

// Open the installer download in the user's browser (update banner).
ipcMain.handle("update:open-download", (_, url) => {
  if (url) shell.openExternal(String(url));
});

// Stable hardware id for this terminal — Windows MachineGuid (license machine-lock +
// cash_registers binding + sync external_id prefix), falling back to MAC then hostname.
const { getMachineId } = require("./machine-id");

ipcMain.handle("system:get-machine-id", () => getMachineId());

ipcMain.handle("pb:get-url", () => {
  return syncConfig?.pbUrl || PB_URL;
});

ipcMain.handle("pb:set-url", (_, url) => {
  syncConfig = { ...syncConfig, pbUrl: url };
  if (mainWindow) mainWindow.webContents.send("pb:url-changed", url);
  return true;
});

// ── Sync: push this terminal's unsynced rows to the cloud ingest ─────────────

// Read/patch the LOCAL PocketBase as the embedded superuser — the local
// collections require auth to list. These creds are for the device's own DB only.
async function syncLocalAuth(localUrl) {
  const email = process.env.PB_ADMIN_EMAIL || "admin@pos.local";
  const password = process.env.PB_ADMIN_PASS || "admin12345";
  const res = await fetch(`${localUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) throw new Error("local PocketBase auth failed");
  const data = await res.json();
  return data.token;
}

async function doSync() {
  // remoteUrl = full URL of the cloud ingest (POST /api/sync/ingest)
  // apiKey    = this terminal's bearer token (terminal_tokens); entity is resolved cloud-side from it
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return;
  const ingestUrl = syncConfig.remoteUrl;
  const token = syncConfig.apiKey;
  const localUrl = syncConfig.pbUrl || PB_URL;
  const machineId = getMachineId();

  try {
    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Collecting…" });
    const authToken = await syncLocalAuth(localUrl);
    const authHeader = { Authorization: authToken };

    const fetchAll = async (collection, filter) => {
      const qs = `perPage=500${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`;
      const res = await fetch(`${localUrl}/api/collections/${collection}/records?${qs}`, { headers: authHeader });
      if (!res.ok) throw new Error(`read ${collection} failed (${res.status})`);
      const data = await res.json();
      return data.items || [];
    };

    // The unsynced transactional rows.
    const orders = await fetchAll("orders", "is_synced = false");
    const movements = await fetchAll("inventory_movements", "is_synced = false");
    const khataTxns = await fetchAll("khata_transactions", "is_synced = false");

    if (!orders.length && !movements.length && !khataTxns.length) {
      mainWindow?.webContents.send("sync:status", { status: "idle", lastSync: (lastSyncAt = new Date().toISOString()), message: "Up to date" });
      return;
    }

    // Supporting rows the ingest needs to map local ids → cloud ids.
    const registers = await fetchAll("cash_registers");     // few; idempotent upsert by machine_id
    const khataAccounts = await fetchAll("khata_accounts");  // matched by phone; idempotent
    const products = await fetchAll("products");             // for SKU → cloud product mapping

    const batch = {
      machineId,
      registers: registers.map((r) => ({ id: r.id, machine_id: r.machine_id, name: r.name, default_opening_float: r.default_opening_float, is_active: r.is_active })),
      orders: orders.map((o) => ({ id: o.id, order_no: o.order_no, register_id: o.register_id || null, order_type: o.order_type, status: o.status, items: o.items, subtotal: o.subtotal, gst_total: o.gst_total, grand_total: o.grand_total, payment_method: o.payment_method, payment_channel: o.payment_channel || null, payment_ref: o.payment_ref || null, digital_signature: o.digital_signature || null, invoice_date: o.invoice_date || null, customer_name: o.customer_name || null, customer_phone: o.customer_phone || null, salesperson_id: o.salesperson_id || null, delivery_address: o.delivery_address || null, complimentary_reason: o.complimentary_reason || null, is_quotation: o.is_quotation || false, created: o.created })),
      products: products.map((p) => ({ id: p.id, sku: p.sku })),
      movements: movements.map((m) => ({ id: m.id, product: m.product, movement_type: m.movement_type, quantity: m.quantity, reference_id: m.reference_id || null, notes: m.notes || null })),
      khataAccounts: khataAccounts.map((a) => ({ id: a.id, debtor_name: a.debtor_name, debtor_phone: a.debtor_phone || null, credit_limit: a.credit_limit })),
      khataTxns: khataTxns.map((t) => ({ id: t.id, khata_account: t.khata_account, transaction_type: t.transaction_type, amount: t.amount, reference_id: t.reference_id || null, notes: t.notes || null })),
    };

    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Uploading…" });
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ingest ${res.status}: ${text.slice(0, 200)}`);
    }

    // Orders the cloud REJECTED (signature mismatch) must NOT be marked synced — else the sale is
    // silently lost (dropped cloud-side + never retried). Keep them local + unsynced for retry (a
    // re-bootstrap provisions the TPN so a valid order then verifies). Rare once the TPN is
    // provisioned; this is the durability backstop against silent loss.
    let rejectedOrderNos = new Set();
    try {
      const data = await res.json();
      rejectedOrderNos = new Set((data && data.result && data.result.ordersRejected) || []);
    } catch (_) { /* no/invalid body — fall back to marking all, as before */ }
    if (rejectedOrderNos.size > 0) {
      console.warn(`[Sync] ${rejectedOrderNos.size} order(s) rejected on ingest (signature) — kept local for retry`);
    }

    // Mark the pushed transactional rows synced. The cloud batch is idempotent, so
    // re-pushing after a failed mark is harmless.
    const markSynced = async (collection, rows) => {
      for (const r of rows) {
        await fetch(`${localUrl}/api/collections/${collection}/records/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ is_synced: true }),
        }).catch(() => {});
      }
    };
    await markSynced("orders", orders.filter((o) => !rejectedOrderNos.has(o.order_no)));
    await markSynced("inventory_movements", movements);
    await markSynced("khata_transactions", khataTxns);

    mainWindow?.webContents.send("sync:status", {
      status: "idle",
      lastSync: (lastSyncAt = new Date().toISOString()),
      message: `Synced ${orders.length} orders, ${movements.length} movements, ${khataTxns.length} ledger`,
    });
  } catch (err) {
    mainWindow?.webContents.send("sync:status", { status: "error", message: err.message });
  }
}

// ── Bootstrap: pull this store's catalog + reference data from the cloud into local PB ──
// Cold-start provisioning for a freshly-activated terminal — the inverse of doSync (cloud →
// terminal). The cloud is the source of truth for products. Idempotent: upserts by business
// key (category name, product SKU, khata phone). The endpoint already maps selling_price →
// sale_price; we write the PB-shaped rows it returns.
async function doBootstrap() {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) {
    return { ok: false, error: "Sync not configured" };
  }
  // Derive the bootstrap URL from the configured ingest URL (same origin).
  const bootstrapUrl = syncConfig.bootstrapUrl
    || (syncConfig.remoteUrl.includes("/api/sync/")
          ? syncConfig.remoteUrl.replace(/\/api\/sync\/[^/]+\/?$/, "/api/sync/bootstrap")
          : syncConfig.remoteUrl.replace(/\/$/, "") + "/api/sync/bootstrap");
  const token = syncConfig.apiKey;
  const localUrl = syncConfig.pbUrl || PB_URL;

  try {
    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Bootstrapping…" });

    const res = await fetch(bootstrapUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`bootstrap ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();

    // Refresh the terminal mode from the cloud (an owner can flip POS ↔ back office in the web).
    if (data.register && (data.register.mode === "POS" || data.register.mode === "BACK_OFFICE")) {
      terminalMode = data.register.mode;
      mainWindow?.webContents.send("terminal:mode", terminalMode);
    }

    const authToken = await syncLocalAuth(localUrl);
    const jsonAuth = { "Content-Type": "application/json", Authorization: authToken };
    const esc = (s) => String(s).replace(/"/g, '\\"');

    const findOne = async (collection, filter) => {
      const url = `${localUrl}/api/collections/${collection}/records?perPage=1&filter=${encodeURIComponent(filter)}`;
      const r = await fetch(url, { headers: { Authorization: authToken } });
      if (!r.ok) return null;
      const j = await r.json();
      return (j.items && j.items[0]) || null;
    };
    const createRec = (collection, payload) =>
      fetch(`${localUrl}/api/collections/${collection}/records`, { method: "POST", headers: jsonAuth, body: JSON.stringify(payload) });
    const updateRec = (collection, id, payload) =>
      fetch(`${localUrl}/api/collections/${collection}/records/${id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify(payload) });

    // 1. Categories (by name) → name → local id.
    const catMap = new Map();
    for (const c of data.categories || []) {
      if (!c.name) continue;
      const existing = await findOne("categories", `name = "${esc(c.name)}"`);
      if (existing) { catMap.set(c.name, existing.id); continue; }
      const r = await createRec("categories", { name: c.name });
      if (r.ok) { const rec = await r.json(); catMap.set(c.name, rec.id); }
    }

    // 2. Products (by SKU). category resolved by name; sale_price already mapped cloud-side.
    let products = 0;
    for (const p of data.products || []) {
      const fields = {
        name: p.name, sku: p.sku, barcode: p.barcode, qr_code: p.qr_code,
        hsn_code: p.hsn_code, unit: p.unit, mrp: p.mrp, sale_price: p.sale_price,
        wholesale_price: p.wholesale_price, current_stock: p.current_stock,
        reorder_point: p.reorder_point, image_url: p.image_url, is_active: p.is_active,
        sold_by_weight: p.sold_by_weight, gst_exempt: p.gst_exempt,
      };
      if (p.category_name && catMap.has(p.category_name)) fields.category = catMap.get(p.category_name);
      const existing = p.sku ? await findOne("products", `sku = "${esc(p.sku)}"`) : null;
      const r = existing ? await updateRec("products", existing.id, fields) : await createRec("products", fields);
      if (r.ok) products++;
    }

    // 3. Khata accounts (by phone, else name).
    let khata = 0;
    for (const k of data.khata || []) {
      const filter = k.debtor_phone ? `debtor_phone = "${esc(k.debtor_phone)}"` : `debtor_name = "${esc(k.debtor_name)}"`;
      const fields = {
        debtor_name: k.debtor_name, debtor_phone: k.debtor_phone || "",
        credit_limit: k.credit_limit, outstanding_balance: k.outstanding_balance,
        party_type: k.party_type, credit_term_days: k.credit_term_days, status: k.status,
      };
      const existing = await findOne("khata_accounts", filter);
      const r = existing ? await updateRec("khata_accounts", existing.id, fields) : await createRec("khata_accounts", fields);
      if (r.ok) khata++;
    }

    // 4. Store team → local PB auth users (same bcrypt hash → same password as web).
    //    Uses the custom superuser route that mirrors the cloud hash into users.password.
    let users = 0;
    const roleMap = { OWNER: "owner", MANAGER: "manager", CASHIER: "cashier", STAFF: "cashier" };
    for (const u of data.users || []) {
      if (!u.email || !u.password_hash) continue;
      const r = await fetch(`${localUrl}/api/custom/sync-user`, {
        method: "POST",
        headers: jsonAuth,
        body: JSON.stringify({
          email: u.email,
          name: u.full_name || "",
          role: roleMap[u.sub_role] || "cashier",
          password_hash: u.password_hash,
        }),
      });
      if (r.ok) users++;
    }

    // 5. Store profile → local settings singleton. CRITICAL: sync tpn_gstin so the terminal signs
    //    orders with the SAME TPN the cloud recomputes the signature with — otherwise the ingest
    //    rejects valid orders (signature mismatch). Also store name / cloud entity id for receipts
    //    + sync stamping. PATCH preserves the shopkeeper's printer/receipt tweaks; create seeds a
    //    complete row (mirrors hooks/use-settings defaults) if none exists yet.
    if (data.entity) {
      const e = data.entity;
      const existing = await findOne("settings", "id != ''"); // settings is a singleton
      if (existing) {
        const patch = { tpn_gstin: e.tpn_gstin || "", store_entity_id: e.id || "" };
        if (e.name) patch.store_name = e.name;
        await updateRec("settings", existing.id, patch);
      } else {
        await createRec("settings", {
          store_name: e.name || "My Store",
          store_address: "",
          tpn_gstin: e.tpn_gstin || "",
          phone: e.whatsapp_no || "",
          receipt_header: "",
          receipt_footer: "Thank you for your business!",
          gst_rate: 5,
          store_entity_id: e.id || "",
          printer_device_name: "",
          printer_paper_width: 80,
          printer_auto_print: false,
          printer_copies: 1,
          printer_open_drawer: false,
        });
      }
    }

    mainWindow?.webContents.send("sync:status", {
      status: "idle",
      lastSync: (lastSyncAt = new Date().toISOString()),
      message: `Bootstrapped ${products} products, ${catMap.size} categories, ${khata} accounts, ${users} users`,
    });
    return { ok: true, products, categories: catMap.size, khata, users };
  } catch (err) {
    mainWindow?.webContents.send("sync:status", { status: "error", message: err.message });
    return { ok: false, error: err.message };
  }
}

ipcMain.handle("sync:bootstrap", () => doBootstrap());

// Seed the default owner login (admin@pos.local / admin12345) whenever the local users
// collection is empty — on first boot and after a Clear & Re-sync wipe — so there's always a
// fallback login even before the store team syncs from the cloud.
async function seedDefaultUser() {
  try {
    const listRes = await fetch(PB_URL + "/api/collections/users/records?perPage=1");
    const listData = await listRes.json();
    if (!listData.items || listData.items.length === 0) {
      const createRes = await fetch(PB_URL + "/api/collections/users/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@pos.local",
          password: "admin12345",
          passwordConfirm: "admin12345",
          name: "Admin",
          role: "owner",
        }),
      });
      if (createRes.ok) console.log("[Main] Created default POS user: admin@pos.local");
      else console.log("[Main] User creation failed:", await createRes.text());
    }
  } catch (e) {
    console.log("[Main] User seed error:", e.message);
  }
}

// Stop the embedded PB and wait for the process to fully exit — Windows only releases the
// data-dir file locks on exit, so a wipe must wait for this before deleting the folder.
function stopPocketBase() {
  return new Promise((resolve) => {
    if (!pbProcess) return resolve();
    const p = pbProcess;
    pbProcess = null;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    p.once("close", finish);
    try { p.kill(); } catch (_) { finish(); }
    setTimeout(finish, 5000); // fallback if 'close' never fires
  });
}

// Delete a directory, retrying to ride out Windows file-lock lag after PB exits, and verify it is
// actually gone — so a "Clear & Re-sync" can never silently leave the old database behind.
async function wipeDir(dir) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) { /* files still locked — wait and retry */ }
    if (!fs.existsSync(dir)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return !fs.existsSync(dir);
}

// Owner action (Settings → Central Sync → Clear & Re-sync): wipe the local database and rebuild
// it from the cloud. Push any unsynced sales up first, stop PB, delete the data dir, relaunch
// (migrations re-run), re-seed the default owner, then re-bootstrap catalog + store team. The
// renderer signs out + returns to login afterwards.
ipcMain.handle("sync:reset-resync", async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Cancel", "Clear & Re-sync"],
    defaultId: 0,
    cancelId: 0,
    title: "Clear local data",
    message: "Clear ALL local data and re-sync from the cloud?",
    detail:
      "This wipes this terminal's local database — products, customers, team logins, and local sales/shift history — then rebuilds it from the cloud. Any unsynced sales are pushed up first. You will be signed out.",
  });
  if (response !== 1) return { ok: false, cancelled: true };

  try {
    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Pushing unsynced sales…" });
    try { await doSync(); } catch (_) { /* best effort — offline is fine */ }

    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Clearing local database…" });
    await stopPocketBase();
    if (pbDataDir && !(await wipeDir(pbDataDir))) {
      // Couldn't enforce the wipe (files still locked). Bring the existing DB back so the terminal
      // keeps working, and report failure rather than silently pretending it was cleared.
      const relaunch = launchPocketBase(pbDataDir);
      pbProcess = relaunch.proc;
      try { await relaunch.ready(); } catch (_) {}
      mainWindow?.webContents.send("sync:status", { status: "error", message: "Could not clear local data (files in use)" });
      return { ok: false, error: "Could not clear the local database — files are in use. Close any other Pelbu windows and try again." };
    }

    const { proc, ready } = launchPocketBase(pbDataDir);
    pbProcess = proc;
    await ready();
    await seedDefaultUser();

    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Re-syncing from cloud…" });
    const result = await doBootstrap();

    mainWindow?.webContents.send("sync:status", {
      status: "idle",
      lastSync: (lastSyncAt = new Date().toISOString()),
      message: result?.ok ? `Re-synced ${result.products} products, ${result.users} users` : "Local database cleared",
    });
    return { ok: true, ...(result || {}) };
  } catch (err) {
    mainWindow?.webContents.send("sync:status", { status: "error", message: err.message });
    return { ok: false, error: err.message };
  }
});

// ── Licensing: .lic gate + activation ────────────────────────────────────────
// The terminal must present a valid, machine-locked .lic to run. The license carries the
// sync token + ingest URL, so activation also configures sync + runs first-run bootstrap.

function applyLicensePayload(payload) {
  if (payload && payload.sync && payload.sync.ingest_url && payload.sync.token) {
    syncConfig = {
      ...(syncConfig || {}),
      remoteUrl: payload.sync.ingest_url,
      apiKey: payload.sync.token,
      pbUrl: (syncConfig && syncConfig.pbUrl) || PB_URL,
    };
  }
  // Terminal mode is carried in the license payload (and refreshed from bootstrap). A mode change
  // made in the cloud propagates on the next bootstrap without needing a new .lic.
  if (payload && (payload.mode === "POS" || payload.mode === "BACK_OFFICE")) {
    terminalMode = payload.mode;
  }
}

function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 600,
    height: 720,
    title: "Activate Pelbu POS",
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "activation-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  activationWindow.loadFile(path.join(__dirname, "activation.html"));
  activationWindow.on("closed", () => {
    activationWindow = null;
    // Closed without activating (no POS window) → nothing to run; exit cleanly.
    if (!mainWindow) app.quit();
  });
}

// Verify + persist a pasted .lic, configure sync from it, and run first-run bootstrap.
ipcMain.handle("license:activate", async (_, lic) => {
  const result = verifyLicense(lic, getMachineId());
  if (!result.valid) return { ok: false, reason: result.reason };
  try {
    saveLicense(lic);
  } catch (e) {
    return { ok: false, error: "Could not save license: " + e.message };
  }
  applyLicensePayload(result.payload);
  const bootstrap = await doBootstrap().catch((e) => ({ ok: false, error: e.message }));
  return {
    ok: true,
    payload: {
      entity_id: result.payload.entity_id,
      store_name: result.payload.store_name,
      expires_at: result.payload.expires_at,
    },
    bootstrap,
  };
});

// The baked-in cloud URL — lets the activation window pre-fill the field so the operator
// just clicks "Request license". Change it in electron/config.js + rebuild to update.
ipcMain.handle("license:get-default-cloud-url", () => DEFAULT_CLOUD_URL);

// Self-register this machine_id with the cloud so an admin can issue a license. Falls back to
// the baked DEFAULT_CLOUD_URL when the operator leaves the pre-filled field as-is.
ipcMain.handle("license:request", async (_, serverUrl) => {
  try {
    const base = (String(serverUrl || "").trim() || DEFAULT_CLOUD_URL).replace(/\/$/, "");
    if (!base) return { ok: false, error: "No cloud URL configured" };
    const res = await fetch(base + "/api/license/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine_id: getMachineId(),
        hostname: require("os").hostname(),
        app_version: app.getVersion(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, status: data.status } : { ok: false, error: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// After a successful activation, open the POS then close the activation window.
ipcMain.handle("license:proceed", () => {
  createWindow();
  if (activationWindow) activationWindow.close();
  return true;
});

ipcMain.handle("sync:get-status", () => {
  return {
    running: !!syncInterval,
    config: syncConfig,
    lastSyncAt,
  };
});

ipcMain.handle("sync:start", (_, config) => {
  syncConfig = config;
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(doSync, (config.intervalMinutes || 5) * 60 * 1000);
  doSync();
  // Pull catalog + team (incl. mirrored password hashes) from the cloud on launch so
  // cloud-side changes — new products, price updates, password resets — reach the
  // terminal without re-activation. Best-effort; never blocks the push cycle.
  doBootstrap().catch(() => {});
  // Periodic re-pull so cloud-side catalog/price/team changes propagate to the terminal without a
  // restart (near-live pull). Longer cadence than the push — the bootstrap is bulkier.
  if (bootstrapInterval) clearInterval(bootstrapInterval);
  bootstrapInterval = setInterval(() => doBootstrap().catch(() => {}), 15 * 60 * 1000);
  // Poll this store's online (marketplace) orders so they surface + notify on the terminal.
  onlineOrdersPrimed = false;
  if (onlineOrdersInterval) clearInterval(onlineOrdersInterval);
  onlineOrdersInterval = setInterval(() => pollOnlineOrders().catch(() => {}), 45 * 1000);
  pollOnlineOrders().catch(() => {});
  // Poll incoming B2B (wholesale) orders — the fulfilment surface for a distributor/wholesaler terminal.
  b2bOrdersPrimed = false;
  if (b2bOrdersInterval) clearInterval(b2bOrdersInterval);
  b2bOrdersInterval = setInterval(() => pollB2bOrders().catch(() => {}), 45 * 1000);
  pollB2bOrders().catch(() => {});
  return true;
});

ipcMain.handle("sync:stop", () => {
  if (syncInterval) clearInterval(syncInterval);
  if (bootstrapInterval) clearInterval(bootstrapInterval);
  if (onlineOrdersInterval) clearInterval(onlineOrdersInterval);
  if (b2bOrdersInterval) clearInterval(b2bOrdersInterval);
  if (syncDebounce) clearTimeout(syncDebounce);
  syncInterval = null;
  bootstrapInterval = null;
  onlineOrdersInterval = null;
  b2bOrdersInterval = null;
  syncDebounce = null;
  return true;
});

ipcMain.handle("sync:force", async () => {
  await doSync();
  return true;
});

// Near-live push: coalesce rapid local writes (e.g. back-to-back sales) into a single debounced
// push a couple of seconds later, so a sale reaches the cloud in ~seconds instead of waiting for
// the interval. The interval remains the fallback for anything missed.
function scheduleSync(delayMs = 1500) {
  if (!syncConfig) return;
  if (syncDebounce) clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => { syncDebounce = null; doSync().catch(() => {}); }, delayMs);
}
ipcMain.handle("sync:schedule", () => { scheduleSync(); return true; });

// ── Online (marketplace) orders: pull this store's orders from the cloud for in-store management ──
// The terminal is authenticated by the same per-terminal token as the sync. We mirror the store's
// active online orders into local PB `online_orders` so the shopkeeper can manage them + read the
// rider the pickup OTP, and the last-known list survives a brief outage.

// The order endpoints share the ingest origin: …/api/sync/ingest -> …/api/sync/<suffix>.
function deriveSyncUrl(suffix) {
  if (!syncConfig || !syncConfig.remoteUrl) return null;
  return syncConfig.remoteUrl.includes("/api/sync/")
    ? syncConfig.remoteUrl.replace(/\/api\/sync\/[^/]+\/?$/, `/api/sync/${suffix}`)
    : syncConfig.remoteUrl.replace(/\/$/, "") + `/api/sync/${suffix}`;
}

async function pollOnlineOrders() {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return;
  const ordersUrl = deriveSyncUrl("orders");
  const token = syncConfig.apiKey;
  const localUrl = syncConfig.pbUrl || PB_URL;
  try {
    const res = await fetch(ordersUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return; // offline / not configured — keep the last-known local mirror
    const orders = (await res.json()).orders || [];

    const authToken = await syncLocalAuth(localUrl);
    const jsonAuth = { "Content-Type": "application/json", Authorization: authToken };

    const existRes = await fetch(`${localUrl}/api/collections/online_orders/records?perPage=500`, { headers: { Authorization: authToken } });
    const existing = existRes.ok ? (await existRes.json()).items || [] : [];
    const localByCloud = new Map(existing.map((r) => [r.cloud_id, r]));

    const cloudIds = new Set();
    const freshOrders = [];

    for (const o of orders) {
      cloudIds.add(o.cloud_id);
      const payload = {
        cloud_id: o.cloud_id, order_no: o.order_no, status: o.status,
        dispatch_state: o.dispatch_state || "", fulfilment_mode: o.fulfilment_mode || "",
        grand_total: o.grand_total || 0, gst_total: o.gst_total || 0, subtotal: o.subtotal || 0,
        items: o.items || [], customer_name: o.customer_name || "", customer_phone: o.customer_phone || "",
        customer_email: o.customer_email || "", delivery_address: o.delivery_address || "",
        delivery_lat: o.delivery_lat ?? null, delivery_lng: o.delivery_lng ?? null,
        pickup_otp: o.pickup_otp || "", rider_name: o.rider_name || "", created_at_cloud: o.created_at || "",
      };
      const local = localByCloud.get(o.cloud_id);
      if (local) {
        await fetch(`${localUrl}/api/collections/online_orders/records/${local.id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify(payload) }).catch(() => {});
      } else {
        await fetch(`${localUrl}/api/collections/online_orders/records`, { method: "POST", headers: jsonAuth, body: JSON.stringify(payload) }).catch(() => {});
        freshOrders.push(o); // not previously mirrored → genuinely new
      }
    }

    // Prune rows no longer active in the cloud (delivered/cancelled).
    for (const r of existing) {
      if (!cloudIds.has(r.cloud_id)) {
        await fetch(`${localUrl}/api/collections/online_orders/records/${r.id}`, { method: "DELETE", headers: { Authorization: authToken } }).catch(() => {});
      }
    }

    // Notify only after the first poll has primed the mirror (avoids a startup storm on a fresh box).
    if (onlineOrdersPrimed && freshOrders.length) {
      const one = freshOrders.length === 1;
      const title = one ? "New online order" : `${freshOrders.length} new online orders`;
      const body = one
        ? `${freshOrders[0].order_no} — Nu. ${Number(freshOrders[0].grand_total || 0).toFixed(2)}${freshOrders[0].customer_name ? " · " + freshOrders[0].customer_name : ""}`
        : freshOrders.map((o) => o.order_no).join(", ");
      try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch (_) { /* headless */ }
      mainWindow?.webContents.send("online-orders:new", { count: freshOrders.length });
    }
    onlineOrdersPrimed = true;
    mainWindow?.webContents.send("online-orders:changed", { count: orders.length });
  } catch (_) {
    // network error — keep the local mirror as-is
  }
}

async function onlineOrderAction(id, action, reason) {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return { ok: false, error: "Sync not configured" };
  try {
    const res = await fetch(`${deriveSyncUrl("orders")}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${syncConfig.apiKey}` },
      body: JSON.stringify({ action, reason: reason || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    await pollOnlineOrders(); // reflect the change in the local mirror immediately
    return { ok: true, status: data.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle("online-orders:action", (_, { id, action, reason }) => onlineOrderAction(id, action, reason));
ipcMain.handle("online-orders:refresh", () => pollOnlineOrders());

// ── Incoming B2B (wholesale) orders — a distributor/wholesaler BACK_OFFICE terminal fulfils the
//    orders where its store is the seller. Same cloud-pull mirror pattern as online orders, against
//    the b2b_orders collection + /api/sync/wholesale-orders. ──────────────────────────────────────
async function pollB2bOrders() {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return;
  const url = deriveSyncUrl("wholesale-orders");
  const token = syncConfig.apiKey;
  const localUrl = syncConfig.pbUrl || PB_URL;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return; // offline / not configured — keep the last-known mirror
    const orders = (await res.json()).orders || [];

    const authToken = await syncLocalAuth(localUrl);
    const jsonAuth = { "Content-Type": "application/json", Authorization: authToken };

    const existRes = await fetch(`${localUrl}/api/collections/b2b_orders/records?perPage=500`, { headers: { Authorization: authToken } });
    const existing = existRes.ok ? (await existRes.json()).items || [] : [];
    const localByCloud = new Map(existing.map((r) => [r.cloud_id, r]));

    const cloudIds = new Set();
    const freshOrders = [];
    for (const o of orders) {
      cloudIds.add(o.cloud_id);
      const payload = {
        cloud_id: o.cloud_id, order_no: o.order_no, status: o.status, payment_method: o.payment_method || "",
        buyer_name: o.buyer_name || "", buyer_phone: o.buyer_phone || "", buyer_tpn: o.buyer_tpn || "",
        subtotal: o.subtotal || 0, gst_total: o.gst_total || 0, grand_total: o.grand_total || 0,
        items: o.items || [], created_at_cloud: o.created_at || "",
      };
      const local = localByCloud.get(o.cloud_id);
      if (local) {
        await fetch(`${localUrl}/api/collections/b2b_orders/records/${local.id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify(payload) }).catch(() => {});
      } else {
        await fetch(`${localUrl}/api/collections/b2b_orders/records`, { method: "POST", headers: jsonAuth, body: JSON.stringify(payload) }).catch(() => {});
        freshOrders.push(o);
      }
    }
    // Prune rows no longer actionable in the cloud (completed/cancelled/refunded).
    for (const r of existing) {
      if (!cloudIds.has(r.cloud_id)) {
        await fetch(`${localUrl}/api/collections/b2b_orders/records/${r.id}`, { method: "DELETE", headers: { Authorization: authToken } }).catch(() => {});
      }
    }

    if (b2bOrdersPrimed && freshOrders.length) {
      const one = freshOrders.length === 1;
      const title = one ? "New B2B order" : `${freshOrders.length} new B2B orders`;
      const body = one
        ? `${freshOrders[0].order_no} — Nu. ${Number(freshOrders[0].grand_total || 0).toFixed(2)}${freshOrders[0].buyer_name ? " · " + freshOrders[0].buyer_name : ""}`
        : freshOrders.map((o) => o.order_no).join(", ");
      try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch (_) { /* headless */ }
      mainWindow?.webContents.send("b2b-orders:new", { count: freshOrders.length });
    }
    b2bOrdersPrimed = true;
    mainWindow?.webContents.send("b2b-orders:changed", { count: orders.length });
  } catch (_) { /* network error — keep the mirror as-is */ }
}

async function b2bOrderAction(id, status, reason) {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return { ok: false, error: "Sync not configured" };
  try {
    const res = await fetch(`${deriveSyncUrl("wholesale-orders")}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${syncConfig.apiKey}` },
      body: JSON.stringify({ status, reason: reason || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    await pollB2bOrders();
    return { ok: true, status: data.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle("b2b-orders:action", (_, { id, status, reason }) => b2bOrderAction(id, status, reason));
ipcMain.handle("b2b-orders:refresh", () => pollB2bOrders());

// ── App Lifecycle ───────────────────────────────────────────────────────────

// Single-instance lock: a 2nd launch (e.g. the shopkeeper double-clicking the icon again) must NOT
// boot a second PocketBase — it would clash on the :8090 port + the userData dir (Chromium "cache
// Access denied"). The loser quits immediately; the winner surfaces its existing window instead.
// E2E (NEXUS_E2E) relaunches the app repeatedly under Playwright, so the lock is skipped there —
// otherwise a lingering prior instance would make every relaunch self-quit.
const gotSingleInstanceLock = process.env.NEXUS_E2E ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow || activationWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return; // second instance is already quitting — don't boot PB/windows
  // Launch PocketBase with data dir in user's app data (writable)
  pbDataDir = isDev
    ? path.join(__dirname, "..", "pb", "pb_data")
    : path.join(app.getPath("userData"), "pb_data");
  const { proc, ready } = launchPocketBase(pbDataDir);
  pbProcess = proc;

  try {
    await ready();
    console.log("[Main] PocketBase is ready");
    await seedDefaultUser();
  } catch (err) {
    console.error("[Main] PocketBase failed to start:", err.message);
    dialog.showErrorBox("PocketBase Error", "Could not start local database.");
  }

  // Start static file server (serves out/ in production, or in dev when NEXUS_SERVE_BUILT=1)
  if (!isDev || serveBuilt) {
    const serveDir = path.join(__dirname, "..", "out");
    try {
      const { server, port, url } = await startStaticServer(serveDir, APP_PORT);
      staticServer = server;
      console.log(`[Main] Static server running at ${url}`);
    } catch (err) {
      console.error("[Main] Static server failed:", err.message);
      dialog.showErrorBox("Startup Error", "Could not start static server.");
    }
  }

  // License gate: verify the stored .lic against this machine. Valid → POS; else → activate.
  // Dev bypass: skip the gate under `next dev` unless NEXUS_FORCE_LICENSE is set, so the gate
  // can still be exercised locally when wanted.
  const lic = checkLicense();
  if (lic.valid) {
    applyLicensePayload(lic.payload);
    createWindow();
  } else if (isDev && !process.env.NEXUS_FORCE_LICENSE) {
    console.log(`[Main] No valid license (${lic.reason}) — dev mode, skipping gate.`);
    createWindow();
  } else {
    console.log(`[Main] No valid license (${lic.reason}) — opening activation.`);
    createActivationWindow();
  }
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (checkLicense().valid || (isDev && !process.env.NEXUS_FORCE_LICENSE)) createWindow();
      else createActivationWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Production: keep running in the tray (do nothing). E2E: quit so Playwright's app.close() exits
  // cleanly — otherwise close() hangs on the tray-resident app and the embedded PocketBase orphans.
  if (process.env.NEXUS_E2E) app.quit();
});

app.on("before-quit", () => {
  if (staticServer) staticServer.close();
  if (pbProcess) pbProcess.kill();
  if (syncInterval) clearInterval(syncInterval);
  if (bootstrapInterval) clearInterval(bootstrapInterval);
  if (onlineOrdersInterval) clearInterval(onlineOrdersInterval);
  if (b2bOrdersInterval) clearInterval(b2bOrdersInterval);
});
