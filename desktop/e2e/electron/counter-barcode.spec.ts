import { test, expect, ensureLoggedIn } from "./app-fixture";

// The always-focused barcode row (spec WF-01: "Barcode stays focused unless a sheet is open").
//
// Before it existed, the scanner's first character opened the search sheet and the remaining
// characters raced that sheet's focus timer, so fast wedge scans lost their leading digits.
// These tests pin the behaviour that removes the race.
test.describe("barcode row (Electron)", () => {
  test("holds focus on the counter", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});

    const barcode = appPage.locator("#pos-barcode");
    await expect(barcode).toBeVisible({ timeout: 15000 });
    await expect.poll(
      () => appPage.evaluate(() => document.activeElement?.id),
      { timeout: 10000 },
    ).toBe("pos-barcode");
  });

  test("typing goes into the row instead of opening the search sheet", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });

    await appPage.keyboard.type("rice");
    // The characters land in the field — none of them were swallowed to open a sheet.
    await expect(appPage.locator("#pos-barcode")).toHaveValue("rice");

    // Escape clears the field rather than leaving a half-typed code behind.
    await appPage.keyboard.press("Escape");
    await expect(appPage.locator("#pos-barcode")).toHaveValue("");
  });

  test("Enter on a scanned code goes to the catalog, not the picker", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });

    // 8+ digits is treated as a scan: it is looked up directly and reports not-found, rather
    // than opening the product picker.
    await appPage.keyboard.type("99999999");
    await appPage.keyboard.press("Enter");

    await expect(appPage.getByText(/not found for barcode/i)).toBeVisible({ timeout: 10000 });
    await expect(appPage.locator("#pos-barcode")).toHaveValue("");
  });

  // Regression: the barcode row holds the caret continuously, so the keyboard registry's
  // "not while typing" guard would have suppressed every Ctrl/Alt command on the counter.
  // Modifier combos are commands, never typing, and must fire from inside the field.
  test("modifier shortcuts still fire while the barcode row has focus", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    await appPage.keyboard.press("Escape").catch(() => {});
    const barcode = appPage.locator("#pos-barcode");
    await expect(barcode).toBeVisible({ timeout: 15000 });
    await barcode.click();

    // Alt+L = Products: opens the picker without the caret ever leaving the row first.
    await appPage.keyboard.press("Alt+l");
    await expect(appPage.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 10000 });
    await appPage.keyboard.press("Escape");
  });
});
