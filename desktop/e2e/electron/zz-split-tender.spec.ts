import { test, expect, ensureLoggedIn, waitForActiveCart, resetTicket, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const BARCODE = "70000000002";
const CUSTOMER = "E2E Split Buyer";

// Split tender (spec WF-07): one GST bill settled by more than one means.
//
// Named to sort LAST. This is the only spec that rings a real sale — it moves stock, advances
// the invoice serial, closes the ticket and opens a receipt — and the worker shares one app
// instance, so anything running after it inherits that. Running it last is the cheap fix; the
// proper one is a per-test app instance, which costs ~10s a test.
//
// The assertion that matters is the khata one. Booking the whole bill against the customer when
// only part of it went on credit would overstate their debt by whatever they just handed over in
// cash — a silent accounting error that compounds every sale.
async function superHeaders() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  return { "Content-Type": "application/json", Authorization: auth.token };
}

async function seed() {
  const headers = await superHeaders();

  // Empty ticket — the cart lives in PocketBase and outlives the app.

  // Nu. 100 line → Nu. 105 with 5% GST, which splits cleanly into 50 credit + 55 cash.
  const prod = await fetch(
    `${PB}/api/collections/products/records?filter=${encodeURIComponent(`barcode="${BARCODE}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  if (!prod.items?.length) {
    await fetch(`${PB}/api/collections/products/records`, {
      method: "POST", headers,
      body: JSON.stringify({
        name: "E2E Split Item", sku: "E2E-SPLIT-1", barcode: BARCODE, unit: "Pcs",
        mrp: 100, cost_price: 60, sale_price: 100, wholesale_price: 100,
        current_stock: 500, reorder_point: 5, is_active: true,
      }),
    });
  }

  // A khata account with no limit configured (0 = unlimited), reset to a known balance.
  const existing = await fetch(
    `${PB}/api/collections/khata_accounts/records?filter=${encodeURIComponent(`debtor_name="${CUSTOMER}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  if (existing.items?.length) {
    const id = existing.items[0].id;
    await fetch(`${PB}/api/collections/khata_accounts/records/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ outstanding_balance: 0, credit_limit: 0, status: "ACTIVE" }),
    });
    return id as string;
  }
  const created = await fetch(`${PB}/api/collections/khata_accounts/records`, {
    method: "POST", headers,
    body: JSON.stringify({
      debtor_name: CUSTOMER, debtor_phone: "+97517000999",
      outstanding_balance: 0, credit_limit: 0, status: "ACTIVE",
    }),
  }).then((r) => r.json());
  return created.id as string;
}

async function khataBalance(id: string) {
  const headers = await superHeaders();
  const rec = await fetch(`${PB}/api/collections/khata_accounts/records/${id}`, { headers }).then((r) => r.json());
  return Number(rec.outstanding_balance) || 0;
}

test("a bill split across credit and cash books only the credit part to khata", async ({ appPage }) => {
  const khataId = await seed();
  await resetTicket();
  await ensureLoggedIn(appPage);
  await appPage.reload({ waitUntil: "domcontentloaded" });
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });

  await waitForActiveCart();
  await appPage.locator("#pos-barcode").fill(BARCODE);
  await appPage.locator("#pos-barcode").press("Enter");
  await expect(appPage.locator("tbody").getByText("E2E Split Item")).toBeVisible({ timeout: 15000 });

  // Attach the customer — a credit part is refused without one.
  await appPage.keyboard.press("F9");
  const search = appPage.getByPlaceholder(/search customers/i);
  await expect(search).toBeVisible({ timeout: 10000 });
  await search.fill(CUSTOMER);
  await appPage.getByText(CUSTOMER).first().click();
  // The till bar names the buyer once attached — a credit part is refused without one.
  await expect(appPage.getByText(CUSTOMER).first()).toBeVisible({ timeout: 10000 });

  await appPage.keyboard.press("F10");
  await expect(appPage.getByText("Amount Due")).toBeVisible({ timeout: 10000 });
  await expect(appPage.getByText("Nu. 105.00").first()).toBeVisible();

  // Nu. 50 on credit…
  await appPage.keyboard.press("Alt+5");
  await appPage.locator("#split-amount").fill("50");
  await appPage.keyboard.press("Alt+a");
  await expect(appPage.getByText("Still due")).toBeVisible({ timeout: 10000 });

  // …and the rest in cash: a blank amount means whatever is still due.
  await appPage.keyboard.press("Alt+1");
  await appPage.keyboard.press("Alt+a");
  await expect(appPage.getByText("Fully covered")).toBeVisible({ timeout: 10000 });

  await appPage.keyboard.press("F10");

  // The sale must actually ring — the receipt is the proof. Without this a khata failure below
  // could just mean checkout refused and said so in a toast.
  await expect(appPage.getByText(/receipt|thank you|new sale/i).first()).toBeVisible({ timeout: 15000 });

  // The khata carries the credit part alone, not the whole Nu. 105 bill.
  await expect.poll(() => khataBalance(khataId), { timeout: 20000 }).toBe(50);

  // This is the only spec that rings a real sale, so it hands the counter back deliberately:
  // dismiss the receipt and let the app settle on its fresh ticket before the next spec runs.
  await appPage.keyboard.press("Escape").catch(() => {});
  await expect(appPage.locator("#pos-barcode")).toBeVisible({ timeout: 15000 });
  await expect(appPage.locator("tbody tr")).toHaveCount(0, { timeout: 15000 });
});
