import { test, expect, type Page } from "@playwright/test";
import PocketBase from "pocketbase";

// P2-1 runtime check: the desktop role-based page gating (useRequireRole).
//   settings           → owner only
//   inventory, adjust  → owner | manager
// A disallowed role is redirected home (router.replace("/")) and the privileged nav
// links are hidden. Authoritative enforcement is the PocketBase rules (P0-6); this
// verifies the client UX layer in a real browser (Chromium).
//
// Auth is seeded into localStorage (the app's getPB() restores + server-validates it)
// rather than driven through the login form — the dev server's form hydration is too
// timing-sensitive for a deterministic check, and the guard is what P2-1 is about.

const BASE = "http://127.0.0.1:3019";
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

async function authBlob(email: string) {
  const pb = new PocketBase(PB_URL);
  const res = await pb.collection("users").authWithPassword(email, "testpass123");
  return { token: pb.authStore.token, record: res.record };
}

async function loginAs(page: Page, email: string) {
  const blob = await authBlob(email);
  await page.addInitScript((b) => {
    localStorage.setItem("pb_auth", JSON.stringify(b));
  }, blob);
  await page.goto("/");
  // logged-in signal: the always-present "Orders" nav link on the POS home.
  await expect(page.locator('a[href="/orders"]')).toBeVisible({ timeout: 45_000 });
}

test.describe("P2-1 role-based page gating", () => {
  test("CASHIER: privileged nav hidden + direct nav redirects home", async ({ page }) => {
    await loginAs(page, "cashier@test.local");

    // Nav gating — inventory / adjustments / settings links must be absent.
    await expect(page.locator('a[href="/inventory"]')).toHaveCount(0);
    await expect(page.locator('a[href="/adjustments"]')).toHaveCount(0);
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);

    // Direct navigation to a guarded route → redirected back to "/".
    for (const path of ["/inventory", "/settings", "/adjustments"]) {
      await page.goto(path);
      await expect(page, `cashier should be redirected away from ${path}`).toHaveURL(`${BASE}/`);
    }
  });

  test("MANAGER: inventory/adjustments allowed, settings blocked", async ({ page }) => {
    await loginAs(page, "manager@test.local");

    await expect(page.locator('a[href="/inventory"]')).toBeVisible();   // nav shown
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);   // owner-only — hidden

    await page.goto("/inventory");
    await page.waitForTimeout(1500);             // give any client redirect time to fire
    await expect(page).toHaveURL(/\/inventory$/); // stayed — NOT redirected

    await page.goto("/adjustments");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/adjustments$/);

    await page.goto("/settings");
    await expect(page).toHaveURL(`${BASE}/`);     // redirected (manager != owner)
  });

  test("OWNER: settings allowed", async ({ page }) => {
    await loginAs(page, "owner@test.local");
    await expect(page.locator('a[href="/settings"]')).toBeVisible();

    await page.goto("/settings");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/settings$/);  // stayed — NOT redirected
  });
});
