import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

// GUIDED TOUR — Desktop terminal: manage an incoming online (marketplace) order. Launches the REAL
// Electron app WITH video recording, seeds one online order, then walks it slowly. Run alone:
//   xvfb-run -a npx playwright test --config playwright.electron.config.ts e2e/electron/tour-online-orders.spec.ts
const DESKTOP = path.resolve(__dirname, "..", "..");
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";
const OWNER = { email: "admin@pos.local", password: "admin12345" };
const beat = (p: import("@playwright/test").Page, ms = 1500) => p.waitForTimeout(ms);

async function pbReady(timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { try { if ((await fetch(`${PB}/api/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("PocketBase not ready");
}
async function superToken() {
  const a = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  return a.token as string;
}
async function ensureOwner(token: string) {
  const headers = { "Content-Type": "application/json", Authorization: token };
  const ex = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email="${OWNER.email}"`)}`, { headers }).then((r) => r.json()).catch(() => ({ items: [] }));
  if (!ex.items?.length) {
    await fetch(`${PB}/api/collections/users/records`, { method: "POST", headers, body: JSON.stringify({ email: OWNER.email, password: OWNER.password, passwordConfirm: OWNER.password, name: "Owner", role: "owner" }) });
  }
}
async function seedOnlineOrder(token: string) {
  const headers = { "Content-Type": "application/json", Authorization: token };
  const ex = await fetch(`${PB}/api/collections/online_orders/records?filter=${encodeURIComponent('cloud_id="tour-oo"')}`, { headers }).then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  await fetch(`${PB}/api/collections/online_orders/records`, { method: "POST", headers, body: JSON.stringify({
    cloud_id: "tour-oo", order_no: "MKT-TOUR-0001", status: "CONFIRMED", dispatch_state: "ASSIGNED", fulfilment_mode: "DELIVERY",
    grand_total: 315, gst_total: 15, subtotal: 300, items: [{ name: "Tour Item", quantity: 3, total: 315 }],
    customer_name: "Sonam", customer_phone: "+97517100011", delivery_address: "Changzamtog, Thimphu",
    pickup_otp: "123456", rider_name: "Karma Wangchuk", created_at_cloud: new Date().toISOString(),
  }) });
}

test("TOUR — Desktop: incoming online order + rider pickup OTP", async () => {
  test.setTimeout(180_000);
  const app = await electron.launch({
    args: [".", "--no-sandbox"], cwd: DESKTOP,
    env: { ...process.env, NEXUS_SERVE_BUILT: "1", NEXUS_E2E: "1" },
    recordVideo: { dir: path.join(DESKTOP, "e2e/recordings/tours"), size: { width: 1280, height: 800 } },
    timeout: 90_000,
  });
  const page = await app.firstWindow();
  await pbReady();
  const token = await superToken();
  await ensureOwner(token);
  await seedOnlineOrder(token);

  // 1) Owner signs in (the app boots to "/" on its own — don't goto and race that navigation).
  const email = page.getByPlaceholder(OWNER.email);
  if (await email.isVisible({ timeout: 45_000 }).catch(() => false)) {
    await email.click(); await email.pressSequentially(OWNER.email, { delay: 110 });
    const pw = page.locator('input[type="password"]'); await pw.click(); await pw.pressSequentially(OWNER.password, { delay: 110 });
    await page.getByRole("button", { name: /sign in/i }).click();
  }
  await beat(page, 2200);

  // 2) Open the Online Orders screen and show the incoming order + rider pickup code.
  await page.goto(`${APP}/online-orders.html`); await beat(page, 2500);
  await expect(page.getByText("MKT-TOUR-0001")).toBeVisible({ timeout: 20_000 }); await beat(page, 2000);
  await expect(page.getByText("Sonam")).toBeVisible(); await beat(page, 1500);
  await expect(page.getByText("Pickup code — give to Karma Wangchuk")).toBeVisible(); await beat(page, 1500);
  await expect(page.getByText("123456")).toBeVisible(); await beat(page, 3000);

  await app.close();
});
