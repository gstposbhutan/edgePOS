// Lightweight update check (no electron-updater): ask the cloud for the latest
// published release and, if newer than this build, return it so the renderer can
// show a "download update" banner. Fails silently when offline.
const { app } = require("electron");
const { DEFAULT_CLOUD_URL } = require("./config");

async function fetchLatestRelease() {
  const base = String(DEFAULT_CLOUD_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const url = `${base}/api/desktop/releases/latest?platform=win&channel=stable&current=${encodeURIComponent(app.getVersion())}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.update_available && data.release?.download_url) return data.release;
    return null;
  } catch {
    return null; // offline / unreachable — no banner
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchLatestRelease };
