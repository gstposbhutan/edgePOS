const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Printer
  printer: {
    list: () => ipcRenderer.invoke("printer:list"),
    getStatus: (settings) => ipcRenderer.invoke("printer:get-status", settings),
    print: (order, settings) => ipcRenderer.invoke("printer:print", order, settings),
    test: (settings) => ipcRenderer.invoke("printer:test", settings),
    openDrawer: (settings) => ipcRenderer.invoke("printer:kick-drawer", settings),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    platform: process.platform,
  },

  // Update banner — main process pushes an available release; renderer opens the download.
  update: {
    onAvailable: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("update:available", listener);
      return () => ipcRenderer.removeListener("update:available", listener);
    },
    openDownload: (url) => ipcRenderer.invoke("update:open-download", url),
  },

  // System / hardware identity (binds this terminal to its register)
  system: {
    getMachineId: () => ipcRenderer.invoke("system:get-machine-id"),
  },

  // Terminal mode: "POS" (rings cash sales) vs "BACK_OFFICE" (stock + online orders, no cash sale).
  // From the license/bootstrap; the main process pushes updates on the "terminal:mode" event.
  terminal: {
    getMode: () => ipcRenderer.invoke("terminal:get-mode"),
    onMode: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("terminal:mode", listener);
      return () => ipcRenderer.removeListener("terminal:mode", listener);
    },
  },

  // Sync
  sync: {
    getStatus: () => ipcRenderer.invoke("sync:get-status"),
    start: (config) => ipcRenderer.invoke("sync:start", config),
    stop: () => ipcRenderer.invoke("sync:stop"),
    forceSync: () => ipcRenderer.invoke("sync:force"),
    schedule: () => ipcRenderer.invoke("sync:schedule"),
    bootstrap: () => ipcRenderer.invoke("sync:bootstrap"),
    resetResync: () => ipcRenderer.invoke("sync:reset-resync"),
  },

  // PocketBase
  pb: {
    getUrl: () => ipcRenderer.invoke("pb:get-url"),
    setUrl: (url) => ipcRenderer.invoke("pb:set-url", url),
  },

  // Online (marketplace) orders — main polls the cloud, mirrors to local PB, and notifies on new.
  onlineOrders: {
    action: (id, action, reason) => ipcRenderer.invoke("online-orders:action", { id, action, reason }),
    refresh: () => ipcRenderer.invoke("online-orders:refresh"),
    onNew: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("online-orders:new", listener);
      return () => ipcRenderer.removeListener("online-orders:new", listener);
    },
    onChanged: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("online-orders:changed", listener);
      return () => ipcRenderer.removeListener("online-orders:changed", listener);
    },
  },

  b2bOrders: {
    action: (id, status, reason) => ipcRenderer.invoke("b2b-orders:action", { id, status, reason }),
    refresh: () => ipcRenderer.invoke("b2b-orders:refresh"),
    onNew: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("b2b-orders:new", listener);
      return () => ipcRenderer.removeListener("b2b-orders:new", listener);
    },
    onChanged: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on("b2b-orders:changed", listener);
      return () => ipcRenderer.removeListener("b2b-orders:changed", listener);
    },
  },

  // Events
  onSyncStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("sync:status", listener);
    return () => ipcRenderer.removeListener("sync:status", listener);
  },
});
