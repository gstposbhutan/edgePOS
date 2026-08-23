import { test, expect, ensureLoggedIn, waitForActiveCart, waitForShortcutsReady, resetTicket, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const BARCODE = "70000000004";

// The three ticket-level keys that were reserved by the spec and are now real: Ctrl+T (item
// remark), Alt+T (GST-included basis) and F2 (bill date). Ctrl+B is covered here too, up to the
// point of the print dialog — the OS print window is not something the harness can drive.
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
  if (existing.items?.length) return;

  const res = await fetch(`${PB}/api/collections/products/records`, {
    method: "POST", headers,
    body: JSON.stringify({
      name: "E2E Remark Tea 250g", sku: "E2E-TEA-1", barcode: BARCODE, unit: "Pcs",
      mrp: 120, cost_price: 60, sale_price: 100, wholesale_price: 90,
      current_stock: 60, reorder_point: 5, is_active: true,
    }),
  });
  if (!res.ok) throw new Error("seed product failed: " + (await res.text()));
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

/**
 * Set the persisted GST basis and reboot the window onto it.
 *
 * The flag lives in the zustand `persist` store (localStorage "nexus_pos_layout"), which the
 * app rehydrates on mount. Writing it before the reload means the counter comes up on a known
 * basis with no rehydration race to lose.
 */
async function setStoredBasis(appPage: any, gstIncluded: boolean) {
  await appPage.evaluate((value: boolean) => {
    const KEY = "nexus_pos_layout";
    let parsed: any = { state: {}, version: 0 };
    try { parsed = JSON.parse(localStorage.getItem(KEY) || "") || parsed; } catch { /* first run */ }
    parsed.state = { ...(parsed.state || {}), gstIncluded: value };
    localStorage.setItem(KEY, JSON.stringify(parsed));
  }, gstIncluded);
  await appPage.reload({ waitUntil: "domcontentloaded" });
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  // The reload re-registers the shortcuts; pressing before that lands on nothing.
  await waitForShortcutsReady(appPage);
}

async function scan(appPage: any) {
  await appPage.reload({ waitUntil: "domcontentloaded" });
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });
  // The reload re-registers the shortcuts; a key pressed before that is swallowed silently.
  await waitForShortcutsReady(appPage);
  await waitForActiveCart();
  await waitForActiveCart();
  await appPage.locator("#pos-barcode").fill(BARCODE);
  await appPage.locator("#pos-barcode").press("Enter");
  await expect(appPage.locator("tbody").getByText("E2E Remark Tea 250g")).toBeVisible({ timeout: 15000 });
}

test.describe("remark, GST basis, bill date (Electron)", () => {
  test("Ctrl+T writes a note on the line, and an empty entry clears it", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await scan(appPage);

    await appPage.keyboard.press("Control+t");
    const prompt = appPage.getByTestId("text-prompt");
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await appPage.locator("#text-prompt").fill("damaged carton - sold as seen");
    await appPage.keyboard.press("Enter");
    await expect(prompt).toBeHidden({ timeout: 10000 });

    // The note rides with the line, under the product name.
    await expect(appPage.locator("tbody tr").first()).toContainText("damaged carton - sold as seen", { timeout: 10000 });

    // Reopening shows what is there, and a blank submit clears it — the text prompt passes an
    // empty value through rather than treating it as a cancel.
    await appPage.keyboard.press("Control+t");
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await expect(appPage.locator("#text-prompt")).toHaveValue("damaged carton - sold as seen");
    await appPage.locator("#text-prompt").fill("");
    await appPage.keyboard.press("Enter");
    await expect(appPage.locator("tbody tr").first()).not.toContainText("sold as seen", { timeout: 10000 });
  });

  test("Alt+T switches the GST basis, and refuses to do it mid-ticket", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await appPage.reload({ waitUntil: "domcontentloaded" });
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });

    // The basis is a PERSISTED shop-level setting, so it survives reloads and earlier specs.
    // Normalising it by pressing the key would race the store's rehydration — a press landing
    // before the persisted value is read toggles the pre-hydration default and gets clobbered,
    // which is exactly how this spec flaked. Seeding the stored value and reloading makes the
    // starting basis deterministic; the toggle itself is still exercised by a real key press.
    await setStoredBasis(appPage, false);
    const status = appPage.getByTestId("till-status");
    await expect(status).toHaveText(/^GST 5% \u00b7/, { timeout: 15000 });

    // On an empty ticket the basis flips, and the till bar states it — it changes what every
    // rate on screen means, so it must never be silent.
    await appPage.keyboard.press("Alt+t");
    await expect(status).toHaveText(/^GST 5% incl \u00b7/, { timeout: 10000 });

    // 100.00 entered inclusive: the customer still pays 100.00, with the tax extracted.
    await waitForActiveCart();
    await waitForActiveCart();
    await appPage.locator("#pos-barcode").fill(BARCODE);
    await appPage.locator("#pos-barcode").press("Enter");
    await expect(appPage.locator("tbody").getByText("E2E Remark Tea 250g")).toBeVisible({ timeout: 15000 });
    await expect(appPage.locator("tbody tr").first()).toContainText("100.00");

    // With lines on the ticket it refuses: re-splitting tax under the cashier would change the
    // bill they already quoted.
    await appPage.keyboard.press("Alt+t");
    await expect(appPage.getByText(/Finish or clear the ticket/i)).toBeVisible({ timeout: 10000 });
    await expect(status).toHaveText(/^GST 5% incl \u00b7/);

    // Put the shop back on the exclusive basis — it is persisted, so leaving it on would change
    // what every later spec's prices mean. Written directly for the same reason as above.
    await resetTicket();
    await setStoredBasis(appPage, false);
    await expect(status).toHaveText(/^GST 5% \u00b7/, { timeout: 15000 });
  });

  test("F2 opens the bill date and Today clears the override", async ({ appPage }) => {
    await resetTicket();
    await ensureLoggedIn(appPage);
    await appPage.reload({ waitUntil: "domcontentloaded" });
    await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
    await waitForShortcutsReady(appPage);

    await appPage.keyboard.press("F2");
    await expect(appPage.getByTestId("date-prompt")).toBeVisible({ timeout: 10000 });
    await appPage.locator("#date-prompt").fill("2026-08-01T09:30");
    await appPage.keyboard.press("Enter");
    await expect(appPage.getByTestId("date-prompt")).toBeHidden({ timeout: 10000 });
    await expect(appPage.getByText(/Bill date:/i)).toBeVisible({ timeout: 10000 });

    // Today clears the override rather than stamping a fixed time, so a ticket rung later still
    // carries its own.
    await appPage.keyboard.press("F2");
    await expect(appPage.getByTestId("date-prompt")).toBeVisible({ timeout: 10000 });
    await appPage.getByRole("button", { name: "Today" }).click();
    await expect(appPage.getByText(/Bill date: today/i)).toBeVisible({ timeout: 10000 });
  });

  test("Ctrl+B asks how many barcode labels to print", async ({ appPage }) => {
    await seedProduct();
    await resetTicket();
    await ensureLoggedIn(appPage);
    await scan(appPage);

    await appPage.keyboard.press("Control+b");
    // Stops at the copies prompt: the print itself opens an OS window the harness cannot drive.
    await expect(appPage.getByText("Print barcode labels")).toBeVisible({ timeout: 10000 });
    await expect(appPage.getByText(/How many labels for E2E Remark Tea 250g/i)).toBeVisible();
    await appPage.keyboard.press("Escape");
  });
});
