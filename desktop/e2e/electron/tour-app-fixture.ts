import { test as base, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";

// A copy of app-fixture.ts with recordVideo added to the launch — used only by the desktop TOUR so
// the app session is captured to a .webm. Same proven order (launch → pbReady → ensureOwner, then
// firstWindow), which is what makes firstWindow's load-wait resolve reliably.
const DESKTOP_DIR = path.resolve(__dirname, "..", "..");
const PB = "http://127.0.0.1:8090";
export const OWNER = { email: "admin@pos.local", password: "admin12345", role: "owner" };

async function pbReady(timeoutMs = 45_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if ((await fetch(`${PB}/api/health`)).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("PocketBase (:8090) not reachable within timeout");
}

async function ensureOwner() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const token = auth?.token;
  if (!token) return;
  const headers = { "Content-Type": "application/json", Authorization: token };
  const existing = await fetch(
    `${PB}/api/collections/users/records?filter=${encodeURIComponent(`email="${OWNER.email}"`)}`,
    { headers },
  ).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }));
  if (existing.items?.length) return;
  await fetch(`${PB}/api/collections/users/records`, {
    method: "POST", headers,
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password, passwordConfirm: OWNER.password, name: "E2E Owner", role: OWNER.role }),
  }).catch(() => {});
}

export const test = base.extend<object, { electronApp: ElectronApplication; appPage: Page }>({
  electronApp: [
    async ({}, use) => {
      const app = await electron.launch({
        // --disable-gpu / software rendering: under xvfb the GPU command buffer fails and the
        // renderer can hang before domcontentloaded fires; force software GL so the window loads.
        args: [".", "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--in-process-gpu"],
        cwd: DESKTOP_DIR,
        env: { ...process.env, NEXUS_SERVE_BUILT: "1", NEXUS_E2E: "1", LIBGL_ALWAYS_SOFTWARE: "1" },
        recordVideo: { dir: path.join(DESKTOP_DIR, "e2e/recordings/tours"), size: { width: 1280, height: 800 } },
        timeout: 90_000,
      });
      await pbReady();
      await ensureOwner();
      await use(app);
      // Flush + quit. Close windows first (saves the video), then force-quit the tray-resident main.
      try { for (const w of app.windows()) await w.close().catch(() => {}); } catch { /* ignore */ }
      try { await app.evaluate(({ app }) => app.exit(0)); } catch { /* ignore */ }
      try { execSync('pkill -9 -f "electron/dist/electron"', { stdio: "ignore" }); } catch { /* none */ }
      try { execSync('pkill -9 -f "pocketbase_linux_arm64"', { stdio: "ignore" }); } catch { /* none */ }
    },
    { scope: "worker" },
  ],
  appPage: [
    async ({ electronApp }, use) => {
      const page = await electronApp.firstWindow();
      // The first window can race the static server at boot — it may have attempted to load :3200
      // before it was serving and be stuck on a failed load (domcontentloaded never fires). Wait for
      // :3200 to actually serve, then force-navigate so we reliably land on the built UI.
      for (let i = 0; i < 40; i++) {
        try { if ((await fetch("http://127.0.0.1:3200/")).ok) break; } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      await page.goto("http://127.0.0.1:3200/", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
      // Wait until the app is actually interactive (login field or the authenticated POS shell) so a
      // tour never acts on a half-mounted page. Background cloud-sync XHRs stay pending (ERR_CONN_REFUSED
      // in E2E), so never wait on networkidle.
      await page.getByPlaceholder(OWNER.email)
        .or(page.getByRole("button", { name: /open shift|close shift/i }))
        .first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
      await use(page);
    },
    { scope: "worker" },
  ],
});

export { expect };

export async function ensureLoggedIn(page: Page) {
  // domcontentloaded, not the default 'load' — the app holds background cloud-sync connections open,
  // so the load event can stall and hang the navigation.
  await page.goto("http://127.0.0.1:3200/", { waitUntil: "domcontentloaded" }).catch(() => {});
  const email = page.getByPlaceholder(OWNER.email);
  const shiftBtn = page.getByRole("button", { name: /open shift|close shift/i });
  await expect(email.or(shiftBtn).first()).toBeVisible({ timeout: 60_000 });
  if (await email.isVisible().catch(() => false)) {
    await email.fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(shiftBtn).toBeVisible({ timeout: 30_000 });
  }
}
