import { test, expect, ensureLoggedIn } from "./app-fixture";

// Core POS on the REAL Electron app: the owner signs in and the POS toolbar renders with its core
// controls. (Shift open/close + sale flows are covered exhaustively by the web suite; here we just
// prove the packaged desktop POS boots to a working authenticated toolbar.)
test.describe("desktop POS core (Electron)", () => {
  test("owner signs in and the POS toolbar renders", async ({ appPage }) => {
    await ensureLoggedIn(appPage);

    // Dismiss any modal a sibling test may have left open (worker-shared page).
    await appPage.keyboard.press("Escape").catch(() => {});

    // Always-present, size-independent controls once authenticated: a shift control + logout.
    await expect(appPage.getByRole("button", { name: /open shift|close shift/i })).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("svg.lucide-log-out").first()).toBeVisible();
    // The New Sale action is present too.
    await expect(appPage.locator("svg.lucide-file-plus").first()).toBeVisible();
  });
});
