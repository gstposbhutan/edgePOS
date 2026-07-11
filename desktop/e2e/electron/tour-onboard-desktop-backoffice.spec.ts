import { test, ensureLoggedIn, OWNER } from "./tour-app-fixture";
import type { ElectronApplication, Page } from "@playwright/test";
import { injectOverlay, titleCard, caption, clearCaption, clearHighlight, callout, beat } from "../lib/tour-overlay";

// GUIDED TOUR — the BACK_OFFICE desktop terminal used by distributors & wholesalers. Unlike a retail
// POS terminal it NEVER rings a cash sale: no register, no cash drawer. It is a stock + orders station —
// Stock, Online orders, B2B (wholesale) orders and Customers. Like the owner tour it EXPLAINS EVERY
// SCREEN with spotlit callout()s. Same baked-in overlays as the web tours; recorded via tour-app-fixture.
//   xvfb-run -a npx playwright test --config playwright.electron.config.ts e2e/electron/tour-onboard-desktop-backoffice.spec.ts
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";
const KICK = "DESKTOP · TERMINAL — BACK OFFICE";

// One shared superuser session (admin@pos.local is a PB superuser in the E2E box).
async function superAuth(): Promise<Record<string, string> | null> {
  try {
    const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: OWNER.email, password: OWNER.password }),
    }).then((r) => r.json());
    if (!auth?.token) return null;
    return { "Content-Type": "application/json", Authorization: auth.token };
  } catch { return null; }
}

// Terminal mode is pushed from the Electron MAIN process (from the .lic payload / sync bootstrap) and
// read by the renderer over the "terminal:get-mode" IPC + "terminal:mode" event. There is no env knob
// to boot into BACK_OFFICE, but we can force it at runtime from the main process: override the get-mode
// handler and emit the mode event so the live useTerminalMode() hook flips the UI. Best-effort — if it
// fails we still navigate the (identical) back-office screens directly.
async function forceBackOffice(electronApp: ElectronApplication): Promise<boolean> {
  try {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
      try { ipcMain.removeHandler("terminal:get-mode"); } catch { /* not registered yet */ }
      ipcMain.handle("terminal:get-mode", () => "BACK_OFFICE");
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send("terminal:mode", "BACK_OFFICE"); } catch { /* ignore */ }
      }
    });
    return true;
  } catch { return false; }
}

// Enable NQRC + store profile so any settings-driven UI is populated (kept for parity with the other
// tours; a back-office terminal shows no payment QR, but the store profile still applies).
async function seedSettings(headers: Record<string, string>) {
  const payload = {
    store_name: "Druk Distributors",
    nqrc_enabled: true, nqrc_merchant_name: "Druk Distributors", nqrc_merchant_city: "Thimphu",
    nqrc_account_id: "1000123456789", nqrc_psp_guid: "BT.RMA.NQR", nqrc_mcc: "5411", nqrc_account_tag: "26",
  };
  const list = await fetch(`${PB}/api/collections/settings/records?limit=1`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  if (list.items?.length) {
    await fetch(`${PB}/api/collections/settings/records/${list.items[0].id}`, {
      method: "PATCH", headers, body: JSON.stringify(payload),
    }).catch(() => {});
  } else {
    await fetch(`${PB}/api/collections/settings/records`, {
      method: "POST", headers, body: JSON.stringify({ gst_rate: 5, ...payload }),
    }).catch(() => {});
  }
}

// A demo product so the Stock table has a row to explain (receive / label / edit).
async function seedProduct(headers: Record<string, string>) {
  const sku = "TOUR-COLA-500";
  const ex = await fetch(`${PB}/api/collections/products/records?filter=${encodeURIComponent(`sku="${sku}"`)}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/products/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  await fetch(`${PB}/api/collections/products/records`, {
    method: "POST", headers, body: JSON.stringify({
      name: "Druk Tour Cola 500ml", sku, barcode: "8901234500019", hsn_code: "2202", unit: "btl",
      mrp: 60, cost_price: 40, sale_price: 55, wholesale_price: 48, distributor_price: 45,
      current_stock: 120, reorder_point: 20, sold_by_weight: false, gst_exempt: false, is_active: true,
    }),
  }).catch(() => {});
}

// Incoming marketplace order + assigned rider + pickup OTP.
async function seedOnlineOrder(headers: Record<string, string>) {
  const ex = await fetch(`${PB}/api/collections/online_orders/records?filter=${encodeURIComponent('cloud_id="tour-oo"')}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/online_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  await fetch(`${PB}/api/collections/online_orders/records`, {
    method: "POST", headers, body: JSON.stringify({
      cloud_id: "tour-oo", order_no: "MKT-TOUR-0001", status: "CONFIRMED", dispatch_state: "ASSIGNED", fulfilment_mode: "DELIVERY",
      grand_total: 315, gst_total: 15, subtotal: 300, items: [{ name: "Druk Tour Cola 500ml", quantity: 3, total: 315 }],
      customer_name: "Sonam", customer_phone: "+97517100011", delivery_address: "Changzamtog, Thimphu",
      pickup_otp: "123456", rider_name: "Karma Wangchuk", created_at_cloud: new Date().toISOString(),
    }),
  }).catch(() => {});
}

// Incoming wholesale (B2B) order awaiting fulfilment — the back-office terminal's bread and butter.
async function seedB2bOrder(headers: Record<string, string>) {
  const ex = await fetch(`${PB}/api/collections/b2b_orders/records?filter=${encodeURIComponent('cloud_id="tour-b2b"')}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/b2b_orders/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  await fetch(`${PB}/api/collections/b2b_orders/records`, {
    method: "POST", headers, body: JSON.stringify({
      cloud_id: "tour-b2b", order_no: "WHS-TOUR-0001", status: "CONFIRMED", payment_method: "CREDIT",
      buyer_name: "Norzin General Shop", buyer_phone: "+97517200022", buyer_tpn: "BT-RET-0099",
      subtotal: 4800, gst_total: 240, grand_total: 5040,
      items: [{ name: "Druk Tour Cola 500ml", quantity: 96, total: 5040 }],
      created_at_cloud: new Date().toISOString(),
    }),
  }).catch(() => {});
}

// A khata (credit) account so the Customers screen has a populated row.
async function seedCustomer(headers: Record<string, string>) {
  const phone = "+97517300033";
  const ex = await fetch(`${PB}/api/collections/khata_accounts/records?filter=${encodeURIComponent(`debtor_phone="${phone}"`)}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of ex.items || []) await fetch(`${PB}/api/collections/khata_accounts/records/${e.id}`, { method: "DELETE", headers }).catch(() => {});
  await fetch(`${PB}/api/collections/khata_accounts/records`, {
    method: "POST", headers, body: JSON.stringify({
      debtor_name: "Tashi Dorji", debtor_phone: phone, credit_limit: 10000, outstanding_balance: 2450, status: "ACTIVE",
    }),
  }).catch(() => {});
}

// Open the product form and explain its key fields (shared with the owner tour). Tolerant throughout.
async function tourProductForm(page: Page, startStep: number) {
  await page.getByRole("button", { name: /add product/i }).click().catch(() => {});
  await page.getByText("Add Product").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await beat(page, 700);
  await callout(page, "#hsn", { step: startStep, title: "HSN code", text: "The tax classification code — required so every sale is filed correctly." });
  await callout(page, "#sale_price", { step: startStep + 1, title: "Selling price", text: "What the buyer pays. It can't exceed the MRP." });
  await callout(page, 'label:has-text("Sold by weight")', { step: startStep + 2, title: "Weighed goods", text: "Tick this for rice, veg or anything sold per-kg — the price becomes a per-unit rate." });
  await callout(page, 'label:has-text("GST exempt")', { step: startStep + 3, title: "GST-exempt product", text: "Tick to ring this item at 0% instead of the flat 5% — for exempt goods." });
  await clearHighlight(page); await clearCaption(page);
  await page.keyboard.press("Escape").catch(() => {});
  await beat(page, 700);
}

test("TOUR — Desktop onboarding for a back-office terminal (distributor / wholesaler)", async ({ appPage, electronApp }) => {
  test.setTimeout(420_000);
  const page = appPage;

  // Seed everything BEFORE login so the terminal's initial queries already carry the demo data. All
  // seeds are best-effort — a schema mismatch degrades to caption-only callouts.
  const headers = await superAuth();
  if (headers) {
    await seedSettings(headers);
    await seedProduct(headers);
    await seedOnlineOrder(headers);
    await seedB2bOrder(headers);
    await seedCustomer(headers);
  }

  await ensureLoggedIn(page); // proven boot + login as the owner account (manager-level access)
  // Flip this terminal into BACK_OFFICE mode from the main process. The live hook redirects the
  // register to Stock; if the override doesn't take, the direct navigation below still tells the story.
  await forceBackOffice(electronApp);
  await beat(page, 900);

  await injectOverlay(page); await beat(page, 800);
  await titleCard(page, {
    kicker: KICK,
    title: "A terminal with no till",
    sub: "Distributors and wholesalers run in back-office mode — stock and orders only, no cash register.",
  }, { hold: 3400 });

  // Show that the register itself is gone on a back-office terminal (best-effort visual; the caption
  // describes the behaviour regardless of what renders).
  await page.goto(`${APP}/`).catch(() => {});
  await injectOverlay(page); await beat(page, 1400);
  await caption(page, { step: "", title: "No register here", text: "A back-office terminal never rings a cash sale — it opens straight into Stock." }, 2800);
  await clearCaption(page);

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 1 — STOCK (/stock.html) — the primary back-office surface
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/stock.html`); await injectOverlay(page); await beat(page, 1400);
  await titleCard(page, { kicker: "DESKTOP · STOCK", title: "Products & inventory", sub: "Add products, receive stock, and raise restock orders.", }, { hold: 2600 });

  await callout(page, 'button:has-text("Products & inventory")', { step: 1, title: "Two tabs", text: "Products & inventory here; Restock to purchase from your own suppliers." });
  await callout(page, 'input[placeholder="Search name, SKU, or barcode"]', { step: 2, title: "Find stock", text: "Search by name, SKU or barcode." });
  await callout(page, 'button:has-text("Scan")', { step: 3, title: "Scan a barcode", text: "Scan with the camera to jump straight to a product." });
  await callout(page, 'button:has-text("Add product")', { step: 4, title: "Add a product", text: "Create a new product with pricing, HSN code and opening stock." });
  await callout(page, 'table tbody tr:first-child [title="Receive stock"]', { step: 5, title: "Receive stock", text: "Top up on-hand quantity when a delivery arrives — logs a stock movement." });
  await callout(page, 'table tbody tr:first-child [title="Print barcode label"]', { step: 6, title: "Print a label", text: "Print a shelf / barcode label for any product from the terminal." });
  await callout(page, 'table tbody tr:first-child [title="Edit"]', { step: 7, title: "Edit a product", text: "Change pricing, category or stock settings at any time." });

  // Cross-navigation: the back-office header links straight across to the order + customer screens.
  await callout(page, 'header a[href="/b2b-orders"]', { step: 8, title: "B2B orders", text: "Jump to the wholesale orders your buyers place with you." });
  await callout(page, 'header a[href="/online-orders"]', { step: 9, title: "Online orders", text: "Jump to incoming marketplace orders." });
  await callout(page, 'header a[href="/customers"]', { step: 10, title: "Customers", text: "Jump to your credit (khata) accounts." });

  // Open the product form to explain the key fields.
  await tourProductForm(page, 11);

  // Restock tab — suppliers + purchase orders.
  await page.getByRole("button", { name: /^Restock$/ }).click().catch(() => {});
  await beat(page, 900);
  await callout(page, 'input[placeholder="e.g. Thimphu Wholesale"]', { step: 15, title: "Add a supplier", text: "Register the wholesalers you buy from — then raise restock orders against them." });
  await callout(page, 'button:has-text("Add supplier")', { step: 16, title: "Save the supplier", text: "Once added, build a restock order line-by-line and send it to that supplier." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 2 — ONLINE ORDERS (/online-orders.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/online-orders.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · ONLINE ORDERS", title: "Orders come to the counter", sub: "Marketplace orders land right here — even offline-resilient.", }, { hold: 2600 });
  await page.getByText("MKT-TOUR-0001").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

  await callout(page, "text=MKT-TOUR-0001", { step: 17, title: "An incoming order", text: "New marketplace orders appear automatically, with the order number and total." });
  await callout(page, "text=Sonam", { step: 18, title: "Who it's for", text: "Customer name, phone and delivery address are all on the card." });
  await callout(page, "text=/Pickup code/", { step: 19, title: "Rider pickup code", text: "Hand this code to the rider at pickup — it confirms the right order left the shop." });
  await callout(page, 'button:has-text("Confirm")', { step: 20, title: "Work the order", text: "Confirm to accept and start preparing — or cancel with a reason, which returns stock." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 3 — B2B ORDERS (/b2b-orders.html) — the wholesale queue
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/b2b-orders.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · B2B ORDERS", title: "Wholesale orders", sub: "Fulfil the orders your business customers place with you.", }, { hold: 2600 });
  await page.getByText("WHS-TOUR-0001").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

  await callout(page, "text=WHS-TOUR-0001", { step: 21, title: "A wholesale order", text: "Orders your retailer customers place appear here with their total and payment terms." });
  await callout(page, "text=Norzin General Shop", { step: 22, title: "The buyer", text: "The buying shop, their phone and TPN — tap the phone to call." });
  await callout(page, "text=/TPN:/", { step: 23, title: "Buyer's TPN", text: "The buyer's Taxpayer Number — carried onto the GST invoice for input-tax credit." });
  await callout(page, 'button:has-text("Start processing")', { step: 24, title: "Fulfil it", text: "Move it along the chain — start processing, dispatch, deliver — or cancel." });
  await callout(page, 'button:has-text("Cancel")', { step: 25, title: "Cancel with restock", text: "Cancelling returns the stock on both sides and reverses any credit; the buyer is notified." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 4 — CUSTOMERS (/customers.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/customers.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · CUSTOMERS", title: "Khata & credit", sub: "Your credit customers and what they owe.", }, { hold: 2600 });

  await callout(page, 'input[placeholder="Search customers..."]', { step: 26, title: "Find a customer", text: "Search by name or phone across all your credit accounts." });
  await callout(page, 'header button:has-text("Add")', { step: 27, title: "Add a customer", text: "Create a khata account and set a credit limit." });
  await callout(page, "text=Credit Limit", { step: 28, title: "Limit & balance", text: "Each row shows the credit limit, outstanding balance and account status." });
  await callout(page, 'table tbody tr:first-child button:has-text("Repay")', { step: 29, title: "Take a repayment", text: "Record a repayment against the balance — cash or digital." });
  await callout(page, 'table tbody tr:first-child button:has-text("Adjust")', { step: 30, title: "Adjust the balance", text: "Post an opening balance, write-off or correction." });

  // ── Outro ──
  await clearHighlight(page);
  await caption(page, { step: "", title: "A stock-and-orders terminal", text: "Stock, online orders, wholesale orders and customers — no cash register, just supply.", }, 3400);
  await clearCaption(page); await beat(page, 900);
  // Video flushes when the fixture closes the window on teardown.
});
