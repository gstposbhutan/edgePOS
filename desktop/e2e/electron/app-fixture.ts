import { test as base, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";

const DESKTOP_DIR = path.resolve(__dirname, "..", "..");
const PB = "http://127.0.0.1:8090";
export const OWNER = { email: "admin@pos.local", password: "admin12345", role: "owner" };

async function pbReady(timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${PB}/api/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("PocketBase (:8090) not reachable within timeout");
}

// Deterministically ensure a known owner login exists (seedDefaultUser only seeds when `users` is
// empty, which isn't guaranteed across runs). Idempotent: create-or-ignore via the _superusers API.
async function ensureOwner() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const token = auth?.token;
  if (!token) return; // superuser creds differ — rely on the app's own seedDefaultUser
  const headers = { "Content-Type": "application/json", Authorization: token };
  const existing = await fetch(
    `${PB}/api/collections/users/records?filter=${encodeURIComponent(`email="${OWNER.email}"`)}`,
    { headers },
  ).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }));
  if (existing.items?.length) return;
  await fetch(`${PB}/api/collections/users/records`, {
    method: "POST", headers,
    body: JSON.stringify({
      email: OWNER.email, password: OWNER.password, passwordConfirm: OWNER.password,
      name: "E2E Owner", role: OWNER.role,
    }),
  }).catch(() => {});
}

// Launches the REAL Electron app on Linux (headless via xvfb). isDev is true for an unpackaged launch,
// so the license gate is bypassed; NEXUS_SERVE_BUILT=1 serves the built `out/` on :3200 with the
// embedded PocketBase on :8090 — the full stack as shipped.
export const test = base.extend<object, { electronApp: ElectronApplication; appPage: Page }>({
  electronApp: [
    async ({}, use) => {
      const app = await electron.launch({
        args: [".", "--no-sandbox"],
        cwd: DESKTOP_DIR,
        env: { ...process.env, NEXUS_SERVE_BUILT: "1", NEXUS_E2E: "1" },
        timeout: 90_000,
      });
      await pbReady();
      await ensureOwner();
      await use(app);
      // Best-effort graceful close (lets before-quit stop PB), then hard-kill as a backstop: the
      // app is tray-resident so app.close() can hang, and a lingering PB child would orphan onto
      // :8090. These pkill patterns can't match the Playwright worker's own command line.
      try { await Promise.race([app.close(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* ignore */ }
      try { execSync('pkill -9 -f "electron/dist/electron"', { stdio: "ignore" }); } catch { /* none */ }
      try { execSync('pkill -9 -f "pocketbase_linux_arm64"', { stdio: "ignore" }); } catch { /* none */ }
    },
    { scope: "worker" },
  ],

  appPage: [
    async ({ electronApp }, use) => {
      const page = await electronApp.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await use(page);
    },
    { scope: "worker" },
  ],
});

export { expect };

// Sign in with the seeded owner account. Waits for the app to finish booting first (Electron + PB +
// static server + hydration can take >15s), then logs in if the login form is showing, and asserts
// the POS rendered (the always-present shift control — layout/shift-independent).
export async function ensureLoggedIn(page: Page) {
  const email = page.getByPlaceholder(OWNER.email);
  const shiftBtn = page.getByRole("button", { name: /open shift|close shift/i });
  // Boot is done once either the login form or the POS is on screen.
  await expect(email.or(shiftBtn).first()).toBeVisible({ timeout: 60_000 });
  if (await email.isVisible().catch(() => false)) {
    await email.fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(shiftBtn).toBeVisible({ timeout: 30_000 });
  }
}
