import { test, expect, type Page } from "@playwright/test";
import PocketBase from "pocketbase";

// Smoke checks for the manager-only pages added for web↔desktop parity:
//   /products              — product CRUD UI
//   /purchases             — purchasing / restock
//   /inventory/movements   — stock movement history
//   /inventory/predictions — reorder suggestions
// Auth is seeded into localStorage (same approach as role-gating.spec.ts).

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
  await expect(page.locator('a[href="/orders"]')).toBeVisible({ timeout: 45_000 });
}

test.describe("manager parity pages", () => {
  test("OWNER: Products + Purchasing nav links are present", async ({ page }) => {
    await loginAs(page, "owner@test.local");
    await expect(page.locator('a[href="/products"]')).toBeVisible();
    await expect(page.locator('a[href="/purchases"]')).toBeVisible();
  });

  test("OWNER: /products renders with an Add control", async ({ page }) => {
    await loginAs(page, "owner@test.local");
    await page.goto("/products");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/products$/); // not redirected
    await expect(page.getByRole("button", { name: /add product/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("OWNER: /purchases renders the view toggles", async ({ page }) => {
    await loginAs(page, "owner@test.local");
    await page.goto("/purchases");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/purchases$/);
    await expect(page.getByRole("button", { name: /New Restock/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Wholesalers/i })).toBeVisible();
  });

  test("OWNER: inventory movements + predictions reachable", async ({ page }) => {
    await loginAs(page, "owner@test.local");
    await page.goto("/inventory/movements");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/inventory\/movements$/);

    await page.goto("/inventory/predictions");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/inventory\/predictions$/);
  });

  test("CASHIER: parity pages are gated", async ({ page }) => {
    await loginAs(page, "cashier@test.local");
    await expect(page.locator('a[href="/products"]')).toHaveCount(0);
    await expect(page.locator('a[href="/purchases"]')).toHaveCount(0);
    for (const path of ["/products", "/purchases", "/inventory/movements", "/inventory/predictions"]) {
      await page.goto(path);
      await expect(page, `cashier should be redirected from ${path}`).toHaveURL(`${BASE}/`);
    }
  });
});
