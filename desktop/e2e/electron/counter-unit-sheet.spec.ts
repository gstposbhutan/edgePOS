import { test, expect, ensureLoggedIn, waitForActiveCart, waitForShortcutsReady, resetTicket, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const PACKED = "70000000005";     // has a pack ladder
const LOOSE = "70000000006";      // piece-only — the sheet must refuse rather than invent one

// Alt+U — the Pcs / Pack / Case sheet (spec: "Unit sheet. ↑↓ Enter Esc"), and the Enter cycle's
// middle step (WF-05). The point of the feature is that the factors are REAL: 12 pieces to a
// pack, 10 packs to a case, and stock stays counted in pieces throughout.
async function auth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  return { "Content-Type": "application/json", Authorization: res.token };
}

async function seed(headers: Record<string, string>, barcode: string, fields: Record<string, unknown>) {
  const existing = await fetch(
    `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${barcode}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  // Update rather than recreate: a fresh id would orphan any cart line pointing at the old row.
  if (existing.items?.length) {
    await fetch(`${PB}/api/collections/products/records/${existing.items[0].id}`, {
      method: "PATCH", headers, body: JSON.stringify(fields),
    });
    return;
  }
  const res = await fetch(`${PB}/api/collections/products/records`, {
    method: "POST", headers, body: JSON.stringify({ barcode, ...fields }),
  });
  if (!res.ok) throw new Error(`seed ${barcode} failed: ` + (await res.text()));
}

async function seedProducts() {
  const headers = await auth();
  await seed(headers, PACKED, {
    name: "E2E Packed Soap", sku: "E2E-SOAP-1", unit: "Pcs",
    mrp: 12, cost_price: 6, sale_price: 10, wholesale_price: 9,
    current_stock: 500, reorder_point: 5, is_active: true,
    pack_size: 12, case_size: 10, pack_label: "", case_label: "",
  });
  await seed(headers, LOOSE, {
    name: "E2E Loose Candle", sku: "E2E-CANDLE-1", unit: "Pcs",
    mrp: 30, cost_price: 15, sale_price: 25, wholesale_price: 22,
    current_stock: 40, reorder_point: 5, is_active: true,
    pack_size: 0, case_size: 0,
  });
  // Don't type a code until the catalog can answer for it.
  for (let i = 0; i < 40; i++) {
    const found = await fetch(
      `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${PACKED}"`)}`,
      { headers },
    ).then((r) => r.json()).catch(() => ({ items: [] }));
    if (found.items?.[0]?.pack_size === 12) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("seeded pack ladder never became readable");
}

async function scan(appPage: any, barcode: string, name: string) {
  await appPage.reload({ waitUntil: "domcontentloaded" });
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });
  // The reload re-registers the shortcuts; Alt+U pressed before that is swallowed silently.
  await waitForShortcutsReady(appPage);
  await waitForActiveCart();
  await waitForActiveCart();
  await appPage.locator("#pos-barcode").fill(barcode);
  await appPage.locator("#pos-barcode").press("Enter");
  await expect(appPage.locator("tbody").getByText(name)).toBeVisible({ timeout: 15000 });
}

test.describe("unit sheet (Electron)", () => {
  test("Alt+U lists the configured ladder and re-rates the line to the chosen level", async ({ appPage }) => {
    await seedProducts();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await scan(appPage, PACKED, "E2E Packed Soap");

    const row = appPage.locator("tbody tr").first();
    // A fresh line starts at the base of the ladder, priced per piece.
    await expect(row.locator("td").nth(5)).toContainText("Pcs");
    await expect(row).toContainText("10.00");

    await appPage.keyboard.press("Alt+u");
    const sheet = appPage.getByTestId("unit-sheet");
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Only the levels the item master actually carries: Pcs, Pack (x12), Case (x120).
    await expect(sheet.getByTestId("unit-level-PCS")).toBeVisible();
    await expect(sheet.getByTestId("unit-level-PACK")).toContainText("x 12");
    await expect(sheet.getByTestId("unit-level-CASE")).toContainText("x 120");

    // ↑↓ moves, Enter selects — the sheet opens on the current level, so one Down lands on Pack.
    await appPage.keyboard.press("ArrowDown");
    await appPage.keyboard.press("Enter");
    await expect(sheet).toBeHidden({ timeout: 10000 });

    // The line is now a pack: the unit cell says so with its factor, and the rate is the pack
    // rate — 12 x 10.00. The price PER PIECE is unchanged, which is the invariant that keeps
    // the switch from looking like a pricing bug.
    await expect(row.locator("td").nth(5)).toContainText("Pack");
    await expect(row.locator("td").nth(5)).toContainText("x 12");
    await expect(row).toContainText("120.00", { timeout: 10000 });
  });

  test("Esc leaves the line exactly as it was", async ({ appPage }) => {
    await seedProducts();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await scan(appPage, PACKED, "E2E Packed Soap");

    const row = appPage.locator("tbody tr").first();
    await appPage.keyboard.press("Alt+u");
    await expect(appPage.getByTestId("unit-sheet")).toBeVisible({ timeout: 10000 });
    await appPage.keyboard.press("ArrowDown");
    await appPage.keyboard.press("Escape");
    await expect(appPage.getByTestId("unit-sheet")).toBeHidden({ timeout: 10000 });

    await expect(row.locator("td").nth(5)).toContainText("Pcs");
    await expect(row).toContainText("10.00");
  });

  test("an item with no pack size says so instead of opening an invented sheet", async ({ appPage }) => {
    await seedProducts();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await scan(appPage, LOOSE, "E2E Loose Candle");

    await appPage.keyboard.press("Alt+u");
    // No sheet, and the cashier is told why — this is the whole reason the key sat reserved.
    await expect(appPage.getByTestId("unit-sheet")).toHaveCount(0);
    await expect(appPage.getByText(/sold in .* only|no pack size set/i)).toBeVisible({ timeout: 10000 });
  });
});
