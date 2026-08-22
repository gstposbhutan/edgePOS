import { test, expect, ensureLoggedIn } from "./app-fixture";

// The counter follows the RanceLab key map (spec: docs/keyboard-shortcuts.html). Shops arrive
// trained on it, so these labels and keys are the product requirement, not cosmetics.
//
// lib/pos-shortcuts.ts is the single source of truth for the bindings, the footer rail and the
// F1 sheet — this proves the three actually agree inside the real app.
test.describe("counter keys (Electron)", () => {
  test("the footer rail is the RanceLab map, across both pages", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});

    // Page 1 — the line/sale keys a cashier uses continuously.
    for (const label of ["Add Quantity", "Less Quantity", "Product Info", "Tender", "Hold Trans", "Item Discount"]) {
      await expect(appPage.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible({ timeout: 15000 });
    }
    await expect(appPage.getByText("Footer page 1")).toBeVisible();

    // The old Pelbu-era labels must be gone.
    await expect(appPage.getByRole("button", { name: /^F5\s*Recall/i })).toHaveCount(0);
    await expect(appPage.getByRole("button", { name: /Bill Disc/i })).toHaveCount(0);

    // Page 2 (spec WF-02).
    await appPage.getByTitle("Next page").click();
    await expect(appPage.getByText("Footer page 2")).toBeVisible();
    for (const label of ["Sales Person", "Party", "Day", "Location"]) {
      await expect(appPage.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
    }
    await appPage.getByTitle("Previous page").click();
    await expect(appPage.getByText("Footer page 1")).toBeVisible();
  });

  test("F1 opens a help sheet built from the same map", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});

    await appPage.keyboard.press("F1");
    await expect(appPage.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 10000 });
    // A key from the map, and one the spec reserves but we have not built.
    await expect(appPage.getByText("Add Quantity").first()).toBeVisible();
    await expect(appPage.getByText("Rate Change").first()).toBeVisible();
    await appPage.keyboard.press("Escape");
    await expect(appPage.getByText("Keyboard Shortcuts")).toHaveCount(0, { timeout: 10000 });
  });

  test("F8 opens the product picker — the RanceLab key, not our old F3", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});

    await appPage.keyboard.press("F8");
    await expect(appPage.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 10000 });
    await appPage.keyboard.press("Escape");
  });
});
