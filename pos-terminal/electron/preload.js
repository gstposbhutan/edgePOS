const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Printer
  printer: {
    getStatus: () => ipcRenderer.invoke("printer:get-status"),
    print: (order, settings) => ipcRenderer.invoke("printer:print", order, settings),
    test: () => ipcRenderer.invoke("printer:test"),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    platform: process.platform,
  },

  // Sync
  sync: {
    getStatus: () => ipcRenderer.invoke("sync:get-status"),
    start: (config) => ipcRenderer.invoke("sync:start", config),
    stop: () => ipcRenderer.invoke("sync:stop"),
    forceSync: () => ipcRenderer.invoke("sync:force"),
  },

  // PocketBase
  pb: {
    getUrl: () => ipcRenderer.invoke("pb:get-url"),
    setUrl: (url) => ipcRenderer.invoke("pb:set-url", url),
  },

  // Events
  onSyncStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("sync:status", listener);
    return () => ipcRenderer.removeListener("sync:status", listener);
  },
});
