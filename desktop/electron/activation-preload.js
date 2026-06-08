const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the standalone activation window (electron/activation.html). Kept separate from
// the main POS preload — the activation window runs before the terminal is licensed.
contextBridge.exposeInMainWorld("activation", {
  getMachineId: () => ipcRenderer.invoke("system:get-machine-id"),
  // Baked-in cloud URL (electron/config.js) — pre-fills the request field.
  getDefaultCloudUrl: () => ipcRenderer.invoke("license:get-default-cloud-url"),
  // Verify + save a pasted .lic, derive sync config, and run first-run bootstrap.
  activate: (lic) => ipcRenderer.invoke("license:activate", lic),
  // Self-register this machine_id with the cloud so the operator can be issued a .lic.
  request: (serverUrl) => ipcRenderer.invoke("license:request", serverUrl),
  // Close activation + open the POS (called after a successful activate).
  proceed: () => ipcRenderer.invoke("license:proceed"),
});
