import { test, expect, ensureLoggedIn } from "./app-fixture";

// Proves the full desktop stack boots on Linux under Electron: PocketBase + static server + window,
// license gate bypassed, and the owner can sign in to the POS.
test.describe("desktop boot (Electron)", () => {
  test("boots to login and signs in to the POS", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    // The shift control is always rendered on the POS (Open or Close), regardless of window width.
    await expect(appPage.getByRole("button", { name: /open shift|close shift/i })).toBeVisible();
  });

  test("embedded PocketBase is reachable", async ({ electronApp }) => {
    const health = await electronApp.evaluate(async () => {
      const res = await fetch("http://127.0.0.1:8090/api/health");
      return res.status;
    });
    expect(health).toBe(200);
  });
});
