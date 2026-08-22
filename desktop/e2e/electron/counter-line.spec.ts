import { test, expect, ensureLoggedIn, waitForActiveCart, resetTicket, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const BARCODE = "70000000001";

// The ticket line end-to-end: scan into the always-focused barcode row, then work the line with
// the RanceLab keys (F3 add quantity, F5 rate change) and the Enter cycle. Also pins the grid's
// column order (spec WF-01), which a cashier reads positionally.
async function seedProduct() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  const headers = { "Content-Type": "application/json", Authorization: auth.token };

  const existing = await fetch(
    `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${BARCODE}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  // Reuse the row if it is already there — deleting and re-creating would orphan a cart line
  // that points at the old product id.
  if (existing.items?.length) return;

  const res = await fetch(`${PB}/api/collections/products/records`, {
    method: "POST", headers,
    body: JSON.stringify({
      name: "E2E Red Rice 1kg",
      sku: "E2E-RICE-1",
      barcode: BARCODE,
      unit: "Pcs",
      mrp: 120,
      cost_price: 80,
      sale_price: 100,
      wholesale_price: 90,
      current_stock: 25,
      reorder_point: 5,
      is_active: true,
    }),
  });
  if (!res.ok) throw new Error("seed product failed: " + (await res.text()));

  // Don't type the code until the catalog can actually answer for it.
  for (let i = 0; i < 40; i++) {
    const found = await fetch(
      `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${BARCODE}"`)}`,
      { headers },
    ).then((r) => r.json()).catch(() => ({ items: [] }));
    if (found.items?.length) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("seeded product never became readable");
}

test.describe("ticket line (Electron)", () => {
  test("scan adds a line, the grid reads in RanceLab order, and F3/F4/F5 work it", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    // Pick up the emptied cart rather than the previous run's lines.
    await appPage.reload({ waitUntil: "domcontentloaded" });
    await appPage.keyboard.press("Escape").catch(() => {});
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
    // Start from a genuinely empty ticket: scanning onto a leftover line would either stack a
    // second row or bump the quantity, and both break the assertions below.
    await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });

    // fill+press on the field itself: waiting only for it to be VISIBLE raced the effect that
    // gives it focus, and the leading characters went nowhere. (counter-barcode covers the
    // focus behaviour itself.)
    await waitForActiveCart();
    await waitForActiveCart();
  await appPage.locator("#pos-barcode").fill(BARCODE);
    await appPage.locator("#pos-barcode").press("Enter");
    // Scoped to the ticket — the success toast carries the same product name.
    await expect(appPage.locator("tbody").getByText("E2E Red Rice 1kg")).toBeVisible({ timeout: 15000 });

    // Column order is the spec's, left to right.
    const headers = appPage.locator("table thead th");
    await expect(headers.nth(0)).toHaveText("Srl");
    await expect(headers.nth(1)).toHaveText("Product Name");
    await expect(headers.nth(2)).toHaveText("Product Code");
    await expect(headers.nth(3)).toHaveText("Stock");
    await expect(headers.nth(4)).toHaveText("Qty");
    await expect(headers.nth(5)).toHaveText("Unit");
    await expect(headers.nth(6)).toHaveText("Sale Tax Price Name");
    await expect(headers.nth(7)).toHaveText("Amount");

    // The line carries its code, the product's own unit and the tax name.
    await expect(appPage.locator("tbody").getByText("E2E-RICE-1")).toBeVisible();
    await expect(appPage.locator("tbody tr").first().locator("td").nth(5)).toHaveText("Pcs");
    await expect(appPage.locator("tbody tr").first().locator("td").nth(6)).toHaveText("GST 5%");

    const qtyCell = appPage.locator("tbody tr").first().locator("td").nth(4);
    await expect(qtyCell).toContainText("1");

    // F3 = Add Quantity (RanceLab). Our old map had F3 on search.
    await appPage.keyboard.press("F3");
    await expect(qtyCell).toContainText("2", { timeout: 10000 });

    // F4 = Less Quantity, back down again.
    await appPage.keyboard.press("F4");
    await expect(qtyCell).toContainText("1", { timeout: 10000 });

    // F5 = Rate Change: opens an editor on the Amount cell; Enter commits and hands the
    // caret back to the barcode row.
    await appPage.keyboard.press("F5");
    const rateInput = appPage.locator('tbody input[type="number"]');
    await expect(rateInput).toBeVisible({ timeout: 10000 });
    await rateInput.fill("55");
    await appPage.keyboard.press("Enter");

    await expect(appPage.locator("tbody tr").first()).toContainText("55.00", { timeout: 10000 });
    await expect.poll(
      () => appPage.evaluate(() => document.activeElement?.id),
      { timeout: 10000 },
    ).toBe("pos-barcode");
  });

  // Alt+P — the active price tier. Switching it reprices what is already on the ticket, because
  // one GST bill priced from two different lists is not something a cashier can spot on the
  // printout. The seeded product is 100 retail / 90 wholesale.
  test("Alt+P cycles the price list and reprices the ticket", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await appPage.reload({ waitUntil: "domcontentloaded" });
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });

    await waitForActiveCart();
    await waitForActiveCart();
  await appPage.locator("#pos-barcode").fill(BARCODE);
    await appPage.locator("#pos-barcode").press("Enter");
    await expect(appPage.locator("tbody").getByText("E2E Red Rice 1kg")).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("tbody tr").first()).toContainText("100.00");

    await appPage.keyboard.press("Alt+p");
    // Repriced to the wholesale tier, and the tier is stated on the till bar so the cashier
    // cannot ring it unknowingly.
    await expect(appPage.locator("tbody tr").first()).toContainText("90.00", { timeout: 10000 });
    // First match is the till bar; the confirmation toast carries the word too.
    await expect(appPage.getByText(/Wholesale/).first()).toBeVisible({ timeout: 10000 });
  });

  // Both discount shortcuts called window.prompt, which Electron does not implement — it throws
  // — so they failed outright in the packaged app while working in a browser. They now use a
  // real modal, and this proves the numbers actually land on the ticket.
  test("Ctrl+M discounts the line and Ctrl+Shift+B discounts the bill", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await appPage.reload({ waitUntil: "domcontentloaded" });
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });
    await waitForActiveCart();
    await appPage.locator("#pos-barcode").fill(BARCODE);
    await appPage.locator("#pos-barcode").press("Enter");
    await expect(appPage.locator("tbody").getByText("E2E Red Rice 1kg")).toBeVisible({ timeout: 15000 });

    // Ctrl+M works on the HIGHLIGHTED line, so select it explicitly rather than relying on
    // where the selection happened to be left.
    await appPage.locator("tbody tr").first().click();

    // Nu. 10 off each unit: the rate drops to 90 and the line totals 94.50 with 5% GST.
    await appPage.keyboard.press("Control+m");
    // The field itself, not the title — "Item Discount" is also a footer-rail button.
    await expect(appPage.locator("#amount-prompt")).toBeVisible({ timeout: 10000 });
    await appPage.locator("#amount-prompt").fill("10");
    await appPage.keyboard.press("Enter");
    await expect(appPage.locator("tbody tr").first()).toContainText("90.00", { timeout: 10000 });
    await expect(appPage.locator("tbody tr").first()).toContainText("94.50");

    // 10% off the discounted bill, before GST: Nu. 9.00 off a Nu. 90 taxable base.
    await appPage.keyboard.press("Control+Shift+B");
    await expect(appPage.locator("#amount-prompt")).toBeVisible({ timeout: 10000 });
    await appPage.locator("#amount-prompt").fill("10");
    await appPage.keyboard.press("Enter");
    await expect(appPage.getByText(/Invoice disc/i)).toBeVisible({ timeout: 10000 });
    await expect(appPage.getByText("−Nu. 9.00")).toBeVisible({ timeout: 10000 });
  });
});
