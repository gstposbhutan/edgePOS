import { execSync } from "node:child_process";

// Ensure a clean slate before the Electron app launches: no stray Electron holding the
// single-instance lock, and no PocketBase holding :8090 (the app launches its own).
export default async function globalSetup() {
  for (const pat of ["electron/dist/electron", "pb/pocketbase", "serve out"]) {
    try { execSync(`pkill -f "${pat}"`, { stdio: "ignore" }); } catch { /* nothing to kill */ }
  }
  // Give ports a moment to release.
  await new Promise((r) => setTimeout(r, 1500));
}
