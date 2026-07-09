import { test, expect, ensureLoggedIn, OWNER } from "./app-fixture";

const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";

// Seed a row into the local `online_orders` mirror (what the cloud-poll upserts), via the embedded
// superuser — exactly the shape electron/main.js pollOnlineOrders writes.
async function seedOnlineOrder(row: Record<string, unknown>) {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  const headers = { "Content-Type": "application/json", Authorization: auth.token };
  // Clear any prior test rows with this cloud_id (unique index), then insert.
  const existing = await fetch(
    `${PB}/api/collections/online_orders/records?filter=${encodeURIComponent(`cloud_id="${row.cloud_id}"`)}`,
    { headers },
  ).then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of existing.items || []) {
    await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  }
  const res = await fetch(`${PB}/api/collections/online_orders/records`, {
    method: "POST", headers, body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error("seed online_order failed: " + (await res.text()));
}

test.describe("desktop online orders (Electron)", () => {
  test("renders a mirrored online order with customer details + rider pickup OTP", async ({ appPage }) => {
    await ensureLoggedIn(appPage);

    await seedOnlineOrder({
      cloud_id: "e2e-oo-1",
      order_no: "MKT-E2E-0001",
      status: "CONFIRMED",
      dispatch_state: "ASSIGNED",
      fulfilment_mode: "DELIVERY",
      grand_total: 210,
      gst_total: 10,
      subtotal: 200,
      items: [{ name: "E2E Widget", quantity: 2, total: 210 }],
      customer_name: "E2E Buyer",
      customer_phone: "+97517100011",
      customer_email: "buyer@example.com",
      delivery_address: "Changzamtog, Thimphu",
      pickup_otp: "123456",
      rider_name: "Karma Wangchuk",
      created_at_cloud: new Date().toISOString(),
    });

    await appPage.goto(`${APP}/online-orders.html`);

    // The order card renders with its number, the customer, and the rider pickup code to read out.
    await expect(appPage.getByText("MKT-E2E-0001")).toBeVisible({ timeout: 20_000 });
    await expect(appPage.getByText("E2E Buyer")).toBeVisible();
    await expect(appPage.getByText("Pickup code — give to Karma Wangchuk")).toBeVisible();
    await expect(appPage.getByText("123456")).toBeVisible();
    // Confirm / Cancel actions are present for a CONFIRMED order.
    await expect(appPage.getByRole("button", { name: /^confirm$/i })).toBeVisible();
    await expect(appPage.getByRole("button", { name: /^cancel$/i })).toBeVisible();
  });

  test("shows the empty state when there are no online orders", async ({ appPage }) => {
    await ensureLoggedIn(appPage);
    // Clear the mirror.
    const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
    }).then((r) => r.json());
    const headers = { Authorization: auth.token };
    const all = await fetch(`${PB}/api/collections/online_orders/records?perPage=200`, { headers })
      .then((r) => r.json()).catch(() => ({ items: [] }));
    for (const e of all.items || []) {
      await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
    }

    await appPage.goto(`${APP}/online-orders.html`);
    await expect(appPage.getByText(/no online orders right now/i)).toBeVisible({ timeout: 20_000 });
  });
});
