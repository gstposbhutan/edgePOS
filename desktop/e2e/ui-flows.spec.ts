import { test, expect, type Page } from "@playwright/test";
import PocketBase from "pocketbase";

// Manager UI journeys driven through the real built app: create a product, create a
// khata customer, add a wholesaler + draft a purchase order. Each asserts the result
// in PocketBase and cleans up after itself.

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

function admin() { return new PocketBase(PB_URL); }
async function asSuper() {
  const pb = admin();
  await pb.collection("_superusers").authWithPassword("admin@pos.local", "admin12345");
  return pb;
}
async function loginOwner(page: Page) {
  const pb = new PocketBase(PB_URL);
  const res = await pb.collection("users").authWithPassword("owner@test.local", "testpass123");
  await page.addInitScript((b) => localStorage.setItem("pb_auth", JSON.stringify(b)),
    { token: pb.authStore.token, record: res.record });
  await page.goto("/");
  await expect(page.locator('a[href="/orders"]')).toBeVisible({ timeout: 45_000 });
}

test.describe("manager UI flows", () => {
  test("create a product via the form", async ({ page }) => {
    await loginOwner(page);
    const name = uniq("E2E Product");
    await page.goto("/products");
    await expect(page).toHaveURL(/\/products$/);
    await page.getByRole("button", { name: /^Add Product$/ }).first().click();

    // form modal
    await page.locator("#name").fill(name);
    await page.locator("#hsn").fill("1234");
    await page.locator("#sale_price").fill("99");
    // submit (the dialog's button also reads "Add Product")
    await page.getByRole("button", { name: /^Add Product$/ }).last().click();

    const pb = await asSuper();
    let rec: any = null;
    for (let i = 0; i < 20 && !rec; i++) {
      rec = await pb.collection("products").getFirstListItem(`name = "${name}"`, { requestKey: null }).catch(() => null);
      if (!rec) await page.waitForTimeout(400);
    }
    expect(rec, "product should be created in PocketBase").toBeTruthy();
    await pb.collection("products").delete(rec.id).catch(() => {});
  });

  test("create a khata customer", async ({ page }) => {
    await loginOwner(page);
    const name = uniq("E2E Customer");
    await page.goto("/customers");
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.getByPlaceholder("Customer name").fill(name);
    await page.getByRole("button", { name: /^Create Customer$/ }).click();

    const pb = await asSuper();
    let rec: any = null;
    for (let i = 0; i < 20 && !rec; i++) {
      rec = await pb.collection("khata_accounts").getFirstListItem(`debtor_name = "${name}"`, { requestKey: null }).catch(() => null);
      if (!rec) await page.waitForTimeout(400);
    }
    expect(rec, "khata account should be created").toBeTruthy();
    await pb.collection("khata_accounts").delete(rec.id).catch(() => {});
  });

  test("add a wholesaler connection", async ({ page }) => {
    await loginOwner(page);
    const name = uniq("E2E Wholesaler");
    await page.goto("/purchases");
    await page.getByRole("button", { name: /Wholesalers/i }).click();
    await page.getByPlaceholder("Business name *").fill(name);
    await page.getByRole("button", { name: /^Add$/ }).last().click();

    const pb = await asSuper();
    let rec: any = null;
    for (let i = 0; i < 20 && !rec; i++) {
      rec = await pb.collection("wholesaler_connections").getFirstListItem(`wholesaler_name = "${name}"`, { requestKey: null }).catch(() => null);
      if (!rec) await page.waitForTimeout(400);
    }
    expect(rec, "wholesaler connection should be created").toBeTruthy();
    await pb.collection("wholesaler_connections").delete(rec.id).catch(() => {});
  });
});
