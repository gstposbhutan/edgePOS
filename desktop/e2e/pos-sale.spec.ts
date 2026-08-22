import { test, expect, type Page } from "@playwright/test";
import PocketBase from "pocketbase";

// Full POS sale journey through the real UI (built static export + live PocketBase):
// open shift (seeded) → search a demo product → add to cart → checkout (F5) → pay cash
// → order is recorded. The mutation is asserted against PocketBase so it's deterministic.

const BASE = "http://127.0.0.1:3019";
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

function admin() {
  return new PocketBase(PB_URL);
}
async function asSuper() {
  const pb = admin();
  await pb.collection("_superusers").authWithPassword("admin@pos.local", "admin12345");
  return pb;
}
async function authBlob(email: string) {
  const pb = new PocketBase(PB_URL);
  const res = await pb.collection("users").authWithPassword(email, "testpass123");
  return { token: pb.authStore.token, record: res.record, userId: res.record.id };
}
async function loginAs(page: Page, blob: { token: string; record: unknown }) {
  await page.addInitScript((b) => localStorage.setItem("pb_auth", JSON.stringify(b)), blob);
  await page.goto("/");
  await expect(page.locator('a[href="/orders"]')).toBeVisible({ timeout: 45_000 });
}

test.describe("POS cash sale", () => {
  let ownerBlob: Awaited<ReturnType<typeof authBlob>>;

  // Fresh, isolated state per test (no cross-spec coupling): one active shift, no
  // leftover carts.
  test.beforeEach(async () => {
    ownerBlob = await authBlob("owner@test.local");
    const pb = await asSuper();
    const open = await pb.collection("shifts").getFullList({ filter: 'status = "active"', requestKey: null }).catch(() => []);
    for (const s of open) await pb.collection("shifts").delete(s.id).catch(() => {});
    const carts = await pb.collection("carts").getFullList({ filter: 'status = "ACTIVE"', requestKey: null }).catch(() => []);
    for (const c of carts) await pb.collection("carts").delete(c.id).catch(() => {});
    await pb.collection("shifts").create({
      opened_by: ownerBlob.userId, status: "active", opening_float: 1000, opened_at: new Date().toISOString(),
    });
  });

  test.afterEach(async () => {
    const pb = await asSuper();
    const open = await pb.collection("shifts").getFullList({ filter: 'status = "active"', requestKey: null }).catch(() => []);
    for (const s of open) await pb.collection("shifts").delete(s.id).catch(() => {});
  });

  test("search → add product → checkout → pay cash → order recorded", async ({ page }) => {
    await loginAs(page, ownerBlob);

    // Wait for the product grid to populate. If the products query raced auth on a
    // cold page and cached an empty result, a reload re-runs it with valid auth.
    const card = page.getByRole("button", { name: /Coca Cola 1L/ }).first();
    for (let i = 0; i < 3; i++) {
      if (await card.isVisible().catch(() => false)) break;
      await page.waitForTimeout(2500);
      if (await card.isVisible().catch(() => false)) break;
      await page.reload();
      await expect(page.locator('a[href="/orders"]')).toBeVisible({ timeout: 30_000 });
    }
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.scrollIntoViewIfNeeded();

    // The cart add is an async PocketBase mutation; the pay button stays disabled /
    // "Pay Nu. 0" until it lands. Retry the click until the cart reflects the item.
    const payBtn = page.getByRole("button", { name: /Pay Nu\.\s*[1-9]/ });
    for (let i = 0; i < 6; i++) {
      await card.click();
      if (await payBtn.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(800);
    }
    await expect(payBtn).toBeEnabled({ timeout: 10_000 });
    await payBtn.click();

    // Payment modal opens (cash is the default method).
    await expect(page.getByText("Amount Due")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Confirm Payment$/ }).click();

    // The order must land in PocketBase as a CONFIRMED POS sale containing the product.
    const pb = await asSuper();
    let found: any = null;
    for (let i = 0; i < 20 && !found; i++) {
      const recent = await pb.collection("orders").getList(1, 5, { sort: "-created_at", requestKey: null });
      found = recent.items.find((o: any) =>
        o.status === "CONFIRMED" &&
        Array.isArray(o.items) &&
        o.items.some((it: any) => /Coca Cola/i.test(it.name || "")));
      if (!found) await page.waitForTimeout(500);
    }
    expect(found, "a CONFIRMED order with Coca Cola should exist in PocketBase").toBeTruthy();
    expect(found.payment_method).toBe("CASH");

    // cleanup the order this test created
    await pb.collection("orders").delete(found.id).catch(() => {});
  });
});
