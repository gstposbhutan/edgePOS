// ── Build-time configuration (baked into the desktop app) ───────────────────────────────
// Change DEFAULT_CLOUD_URL here, then rebuild + redeploy (`npm run electron:build:win`) for
// terminals to pick it up. By design the cloud URL is NOT runtime-configurable in production —
// it ships with the build.
//
// DEFAULT_CLOUD_URL — the cloud base URL the terminal uses BEFORE it is licensed, for the
// "Request license" step (POST <url>/api/license/request). After activation the .lic carries
// the authoritative ingest/bootstrap URL, so this is only the pre-activation default — it lets
// the operator just click "Request license" without typing anything.
//
// DEV OVERRIDE: set the NEXUS_CLOUD_URL environment variable before launching to point a dev
// terminal at your dev cloud. It's normally unset in a packaged build, so the baked constant
// below is what ships. e.g. PowerShell:  $env:NEXUS_CLOUD_URL = "http://192.168.68.103:3021"
const DEFAULT_CLOUD_URL = process.env.NEXUS_CLOUD_URL || "https://nexus-bt.com";

module.exports = { DEFAULT_CLOUD_URL };
