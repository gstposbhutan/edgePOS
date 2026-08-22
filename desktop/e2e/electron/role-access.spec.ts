import { test, expect } from "./app-fixture";
import type { Page } from "@playwright/test";

// Verifies the UI role layer added in this branch: per-role nav hiding + useRequireRole
// page guards. The authoritative PocketBase rules are covered separately (HTTP tests);
// this drives the REAL Electron GUI (headless via xvfb).
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";

async function superToken(): Promise<string | null> {
  try {
    const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: "admin@pos.local", password: "admin12345" }),
    });
    return r.ok ? (await r.json()).token : null;
  } catch { return null; }
}

async function ensureUser(token: string, email: string, password: string, role: string) {
  const H = { "Content-Type": "application/json", Authorization: token };
  const ex = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email="${email}"`)}`, { headers: H }).then((r) => r.json()).catch(() => ({ items: [] }));
  if (ex.items?.length) {
    await fetch(`${PB}/api/collections/users/records/${ex.items[0].id}`, { method: "PATCH", headers: H, body: JSON.stringify({ role, password, passwordConfirm: password }) }).catch(() => {});
  } else {
    await fetch(`${PB}/api/collections/users/records`, { method: "POST", headers: H, body: JSON.stringify({ email, password, passwordConfirm: password, name: role, role, verified: true }) }).catch(() => {});
  }
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } }).catch(() => {});
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 60_000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /open shift|close shift/i })).toBeVisible({ timeout: 30_000 });
}

const stockNav = (p: Page) => p.getByRole("button", { name: /^stock$/i });
const cashNav = (p: Page) => p.getByRole("button", { name: /^cash$/i });

let seeded = false;
async function seedRoleUsers() {
  if (seeded) return;
  const tok = await superToken();
  expect(tok, "superuser auth (PB must be up)").toBeTruthy();
  await ensureUser(tok!, "support@pelbu.com", "superpass123", "super_admin");
  await ensureUser(tok!, "cashier@store.com", "cashpass123", "cashier");
  seeded = true;
}

test("cashier: manager nav hidden + /stock guarded", async ({ appPage }) => {
  await seedRoleUsers(); // appPage has booted the app + PB by now
  await loginAs(appPage, "cashier@store.com", "cashpass123");
  await expect(stockNav(appPage)).toHaveCount(0);
  await expect(cashNav(appPage)).toHaveCount(0);
  // Direct URL to a manager page → useRequireRole bounces the cashier to the POS.
  // (Static-export routing keeps the URL string as /stock, but the RENDERED surface is
  // the POS home — the stock-management UI never shows.)
  await appPage.goto(`${APP}/stock`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await expect(appPage.getByText(/cart is empty/i)).toBeVisible({ timeout: 20_000 }); // POS home, not stock
  await expect(appPage.getByRole("tab", { name: /restock/i })).toHaveCount(0);        // no stock-mgmt surface
  await expect(stockNav(appPage)).toHaveCount(0);                                     // still no manager nav
});

test("super_admin: manager nav shown + /stock accessible", async ({ appPage }) => {
  await seedRoleUsers();
  await loginAs(appPage, "support@pelbu.com", "superpass123");
  await expect(stockNav(appPage)).toBeVisible();
  await expect(cashNav(appPage)).toBeVisible();
  await stockNav(appPage).click();
  // Landed on the stock management surface (not redirected, not the "manager only" block).
  await expect(appPage).toHaveURL(/\/stock/);
  await expect(appPage.getByText(/manager\/owner only/i)).toHaveCount(0);
});
