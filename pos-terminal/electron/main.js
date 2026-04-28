const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require("electron");
const path = require("path");
const { launchPocketBase, PB_URL } = require("./pb-launcher");
const { printReceipt, getPrinterStatus, testPrint } = require("./printer");

const isDev = !app.isPackaged;

function getResourcePath(...segments) {
  if (isDev) return path.join(__dirname, "..", ...segments);
  return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
}

let mainWindow = null;
let tray = null;
let pbProcess = null;
let syncInterval = null;
let syncConfig = null;

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

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "out", "index.html"));
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

ipcMain.handle("pb:get-url", () => {
  return syncConfig?.pbUrl || PB_URL;
});

ipcMain.handle("pb:set-url", (_, url) => {
  syncConfig = { ...syncConfig, pbUrl: url };
  if (mainWindow) mainWindow.webContents.send("pb:url-changed", url);
  return true;
});

// ── Sync Worker ─────────────────────────────────────────────────────────────

async function doSync() {
  if (!syncConfig || !syncConfig.remoteUrl || !syncConfig.apiKey) return;

  const { remoteUrl, apiKey } = syncConfig;
  const localUrl = syncConfig.pbUrl || PB_URL;

  try {
    mainWindow?.webContents.send("sync:status", { status: "syncing", message: "Pushing orders..." });

    // Fetch local orders that haven't been synced
    const localRes = await fetch(`${localUrl}/api/collections/orders/records?filter=is_synced=false&perPage=100`);
    const localData = await localRes.json();

    for (const order of localData.items || []) {
      try {
        await fetch(`${remoteUrl}/api/collections/orders/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify(order),
        });
        // Mark as synced locally
        await fetch(`${localUrl}/api/collections/orders/records/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_synced: true }),
        });
      } catch (e) {
        console.error("Sync push failed for order", order.id, e.message);
      }
    }

    mainWindow?.webContents.send("sync:status", { status: "idle", lastSync: new Date().toISOString() });
  } catch (err) {
    mainWindow?.webContents.send("sync:status", { status: "error", message: err.message });
  }
}

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
            verified: true,
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

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in tray
  }
});

app.on("before-quit", () => {
  if (pbProcess) pbProcess.kill();
  if (syncInterval) clearInterval(syncInterval);
});
