const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require("electron");
const path = require("path");
const { launchPocketBase, PB_URL } = require("./pb-launcher");
const { printReceipt, getPrinterStatus, testPrint } = require("./printer");
const { startStaticServer } = require("./static-server");
const { verifyLicense } = require("./license");
const { checkLicense, saveLicense } = require("./license-store");
const { DEFAULT_CLOUD_URL } = require("./config");

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
let syncConfig = null;

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
    title: "NEXUS BHUTAN POS",
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
        try { await testPrint(); } catch (e) { dialog.showErrorBox("Printer", e.message); }
      }},
      { type: "separator" },
      { label: "Quit", click: () => {
        if (pbProcess) pbProcess.kill();
        app.exit(0);
      }},
    ]);
    tray.setToolTip("NEXUS BHUTAN POS");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => mainWindow.show());
  } catch (e) {
    console.warn("[Main] Tray creation failed:", e.message);
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle("printer:get-status", async () => getPrinterStatus());

ipcMain.handle("printer:print", async (_, order, settings) => {
  try {
    await printReceipt(order, settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("printer:test", async () => {
  try {
    await testPrint();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

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
      mainWindow?.webContents.send("sync:status", { status: "idle", lastSync: new Date().toISOString(), message: "Up to date" });
      return;
    }

    // Supporting rows the ingest needs to map local ids → cloud ids.
    const registers = await fetchAll("cash_registers");     // few; idempotent upsert by machine_id
    const khataAccounts = await fetchAll("khata_accounts");  // matched by phone; idempotent
    const products = await fetchAll("products");             // for SKU → cloud product mapping

    const batch = {
      machineId,
      registers: registers.map((r) => ({ id: r.id, machine_id: r.machine_id, name: r.name, default_opening_float: r.default_opening_float, is_active: r.is_active })),
      orders: orders.map((o) => ({ id: o.id, order_no: o.order_no, register_id: o.register_id || null, order_type: o.order_type, status: o.status, items: o.items, subtotal: o.subtotal, gst_total: o.gst_total, grand_total: o.grand_total, payment_method: o.payment_method, payment_channel: o.payment_channel || null, payment_ref: o.payment_ref || null, digital_signature: o.digital_signature || null, created: o.created })),
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
    await markSynced("orders", orders);
    await markSynced("inventory_movements", movements);
    await markSynced("khata_transactions", khataTxns);

    mainWindow?.webContents.send("sync:status", {
      status: "idle",
      lastSync: new Date().toISOString(),
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
        sold_by_weight: p.sold_by_weight,
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

    mainWindow?.webContents.send("sync:status", {
      status: "idle",
      lastSync: new Date().toISOString(),
      message: `Bootstrapped ${products} products, ${catMap.size} categories, ${khata} accounts`,
    });
    return { ok: true, products, categories: catMap.size, khata };
  } catch (err) {
    mainWindow?.webContents.send("sync:status", { status: "error", message: err.message });
    return { ok: false, error: err.message };
  }
}

ipcMain.handle("sync:bootstrap", () => doBootstrap());

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
}

function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 600,
    height: 720,
    title: "Activate NEXUS POS",
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
  };
});

ipcMain.handle("sync:start", (_, config) => {
  syncConfig = config;
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(doSync, (config.intervalMinutes || 5) * 60 * 1000);
  doSync();
  return true;
});

ipcMain.handle("sync:stop", () => {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  return true;
});

ipcMain.handle("sync:force", async () => {
  await doSync();
  return true;
});

// ── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Launch PocketBase with data dir in user's app data (writable)
  const dataDir = isDev
    ? path.join(__dirname, "..", "pb", "pb_data")
    : path.join(app.getPath("userData"), "pb_data");
  const { proc, ready } = launchPocketBase(dataDir);
  pbProcess = proc;

  try {
    await ready();
    console.log("[Main] PocketBase is ready");

    // Seed default POS user on first launch
    try {
      // Check if any user exists
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
        if (createRes.ok) {
          console.log("[Main] Created default POS user: admin@pos.local");
        } else {
          console.log("[Main] User creation failed:", await createRes.text());
        }
      }
    } catch (e) {
      console.log("[Main] User seed error:", e.message);
    }
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
  if (process.platform !== "darwin") {
    // Keep running in tray
  }
});

app.on("before-quit", () => {
  if (staticServer) staticServer.close();
  if (pbProcess) pbProcess.kill();
  if (syncInterval) clearInterval(syncInterval);
});
