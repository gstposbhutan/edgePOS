import { test, expect, ensureLoggedIn, OWNER } from "./tour-app-fixture";
import { injectOverlay, titleCard, caption, clearCaption, beat } from "../lib/tour-overlay";

// GUIDED TOUR — Desktop terminal: managing an incoming online (marketplace) order, with the same
// baked-in overlays (title card + captions) as the web tours. Uses tour-app-fixture (a recordVideo
// copy of the proven app-fixture), so the launch + firstWindow + login flow is the known-good one.
//   xvfb-run -a npx playwright test --config playwright.electron.config.ts e2e/electron/tour-online-orders.spec.ts
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";

async function seedOnlineOrder() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
  }).then((r) => r.json());
  const headers = { "Content-Type": "application/json", Authorization: auth.token };
  const ex = await fetch(`${PB}/api/collections/online_orders/records?filter=${encodeURIComponent('cloud_id="tour-oo"')}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  const res = await fetch(`${PB}/api/collections/online_orders/records`, {
    method: "POST", headers, body: JSON.stringify({
      cloud_id: "tour-oo", order_no: "MKT-TOUR-0001", status: "CONFIRMED", dispatch_state: "ASSIGNED", fulfilment_mode: "DELIVERY",
      grand_total: 315, gst_total: 15, subtotal: 300, items: [{ name: "Tour Item", quantity: 3, total: 315 }],
      customer_name: "Sonam", customer_phone: "+97517100011", delivery_address: "Changzamtog, Thimphu",
      pickup_otp: "123456", rider_name: "Karma Wangchuk", created_at_cloud: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("seed online_order failed: " + (await res.text()));
}

test("TOUR — Desktop: incoming online order + rider pickup OTP", async ({ appPage }) => {
  test.setTimeout(150_000);
  const page = appPage;

  await ensureLoggedIn(page);          // proven boot + login (POS root)
  await seedOnlineOrder();
  await injectOverlay(page); await beat(page, 800);
  await titleCard(page, {
    kicker: "Desktop Terminal · Online Orders",
    title: "Orders come to the counter",
    sub: "Marketplace orders land right on the shop terminal — even offline-resilient.",
  });

  // Open the Online Orders screen and re-inject the overlay on the new document.
  await page.goto(`${APP}/online-orders.html`); await injectOverlay(page); await beat(page, 1500);
  await caption(page, { step: 1, title: "An incoming order", text: "A new marketplace order appears on the terminal, auto-confirmed and ready." });
  await expect(page.getByText("MKT-TOUR-0001")).toBeVisible({ timeout: 20_000 }); await beat(page, 1600);

  await caption(page, { step: 2, title: "Who it's for", text: "The customer's name, phone, and delivery address are all on the card." });
  await expect(page.getByText("Sonam")).toBeVisible(); await beat(page, 1800);

  await caption(page, { step: 3, title: "Rider pickup code", text: "Hand this code to the rider at pickup — it confirms the right order left the shop." });
  await expect(page.getByText("Pickup code — give to Karma Wangchuk")).toBeVisible(); await beat(page);
  await expect(page.getByText("123456")).toBeVisible(); await beat(page, 2200);

  await caption(page, { step: 4, title: "One terminal, every channel", text: "In-store sales and online orders — handled from the same counter." }, 3200);
  await clearCaption(page); await beat(page, 800);
  // Video flushes when the fixture closes the window on teardown.
});
