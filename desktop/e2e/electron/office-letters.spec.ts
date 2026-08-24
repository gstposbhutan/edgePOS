import { test, expect, ensureLoggedIn } from "./app-fixture";

const APP = "http://127.0.0.1:3200";

// The Office letter menu (spec WF-08/WF-09): shops arriving from the incumbent ERP navigate the back
// office by single letters, and expect the strip on every Office screen — but never on the
// counter, where letters belong to the barcode row.
test.describe("office letters (Electron)", () => {
  test("letters navigate between modules, and the module's own row wins", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.goto(`${APP}/stock.html`, { waitUntil: "domcontentloaded" }).catch(() => {});

    // The strip is present with the incumbent ERP's module letters.
    await expect(appPage.getByRole("button", { name: /^W\s+Warehouse Management$/i })).toBeVisible({ timeout: 20000 });
    await expect(appPage.getByRole("button", { name: /^C\s+Customer Relationship$/i })).toBeVisible();

    // Inside Warehouse, the second row is shown and its letters take precedence: D is
    // Discrepancy here, not a top-level module.
    await expect(appPage.getByRole("button", { name: /^O\s+Stock Register$/i })).toBeVisible();
    await appPage.keyboard.press("d");
    await expect.poll(() => appPage.url(), { timeout: 15000 }).toContain("adjustments");

    // A top-level letter still moves between modules.
    await appPage.keyboard.press("c");
    await expect.poll(() => appPage.url(), { timeout: 15000 }).toContain("customers");
  });

  test("letters do not fire while typing", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.goto(`${APP}/stock.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await expect(appPage.getByRole("button", { name: /^W\s+Warehouse Management$/i })).toBeVisible({ timeout: 20000 });

    const search = appPage.locator('input[type="text"], input[placeholder]').first();
    await search.click();
    await search.fill("ct");   // both letters are bound modules — they must reach the field

    await expect(search).toHaveValue("ct");
    expect(appPage.url()).toContain("stock");
  });

  test("the strip stays off the counter", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    // appPage lands on the counter; the ticket owns single letters there.
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 20000 });
    await expect(appPage.getByRole("button", { name: /^W\s+Warehouse Management$/i })).toHaveCount(0);
  });
});
