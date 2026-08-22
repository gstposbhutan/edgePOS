import { test, expect, ensureLoggedIn, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const BARCODE = "70000000001";

// The tender sheet used to be mouse-only: F10 opened it and the cashier then had to click to
// pick a method and finish. On a RanceLab counter that is the fastest part of the sale, so the
// sheet has to be workable from the keyboard alone. (Tendering itself is not driven here — it
// would ring a real sale and move stock.)
async function superHeaders() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  return { "Content-Type": "application/json", Authorization: auth.token };
}

async function ensureProductAndEmptyTicket() {
  const headers = await superHeaders();
  const rows = await fetch(`${PB}/api/collections/cart_items/records?perPage=200`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const row of rows.items || []) {
    await fetch(`${PB}/api/collections/cart_items/records/${row.id}`, { method: "DELETE", headers }).catch(() => {});
  }
  const found = await fetch(
    `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${BARCODE}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  if (found.items?.length) return;
  await fetch(`${PB}/api/collections/products/records`, {
    method: "POST", headers,
    body: JSON.stringify({
      name: "E2E Red Rice 1kg", sku: "E2E-RICE-1", barcode: BARCODE, unit: "Pcs",
      mrp: 120, cost_price: 80, sale_price: 100, wholesale_price: 90,
      current_stock: 25, reorder_point: 5, is_active: true,
    }),
  });
}

test("the tender sheet opens on F10 and is worked from the keyboard", async ({ appPage }) => {
  await ensureProductAndEmptyTicket();
  await ensureLoggedIn(appPage);
  await appPage.reload({ waitUntil: "domcontentloaded" });
  await appPage.keyboard.press("Escape").catch(() => {});
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });

  // A ticket with something on it, so tender has an amount. Scoped to the ticket — the success
  // toast carries the same product name.
  // fill+press on the field itself: waiting only for it to be VISIBLE raced the effect that
  // gives it focus. (counter-barcode covers the focus behaviour itself.)
  await appPage.locator("#pos-barcode").fill(BARCODE);
  await appPage.locator("#pos-barcode").press("Enter");
  await expect(appPage.locator("tbody").getByText("E2E Red Rice 1kg")).toBeVisible({ timeout: 15000 });

  await appPage.keyboard.press("F10");
  // The sheet states what it is and how to leave (spec WF-07).
  await expect(appPage.getByText("Amount Due")).toBeVisible({ timeout: 10000 });
  await expect(appPage.getByText("Esc close")).toBeVisible();
  await expect(appPage.getByRole("button", { name: /F10 — Tender/i })).toBeVisible();

  // Cash is the default; E and R restate the tendered amount without touching the mouse.
  await appPage.keyboard.press("r");
  await expect(appPage.getByText(/Ctrl\+1–5 add note/i)).toBeVisible();

  // Alt+5 switches to Khata / Credit — the cash-only hints go away with it.
  await appPage.keyboard.press("Alt+5");
  await expect(appPage.getByText(/Ctrl\+1–5 add note/i)).toHaveCount(0, { timeout: 10000 });

  // Alt+1 back to Cash.
  await appPage.keyboard.press("Alt+1");
  await expect(appPage.getByText(/Ctrl\+1–5 add note/i)).toBeVisible({ timeout: 10000 });

  // Esc closes the sheet and hands the counter back.
  await appPage.keyboard.press("Escape");
  await expect(appPage.getByText("Amount Due")).toHaveCount(0, { timeout: 10000 });
  await expect(appPage.locator("#pos-barcode")).toBeVisible();
});
