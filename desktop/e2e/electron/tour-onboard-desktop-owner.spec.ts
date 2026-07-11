import { test, expect, ensureLoggedIn, OWNER } from "./tour-app-fixture";
import { injectOverlay, titleCard, caption, clearCaption, clearHighlight, callout, beat } from "../lib/tour-overlay";

// GUIDED TOUR — Desktop terminal ONBOARDING for a retailer shop OWNER. Unlike the flow-only tours,
// this one EXPLAINS EVERY SCREEN: each key element is spotlit with callout() and captioned so a new
// owner learns what everything does. Same baked-in overlays (title card + captions + spotlights) as
// the web tours, recorded via tour-app-fixture (recordVideo).
//   xvfb-run -a npx playwright test --config playwright.electron.config.ts e2e/electron/tour-onboard-desktop-owner.spec.ts
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";
const KICK = "DESKTOP · TERMINAL — OWNER";

// One shared superuser session (admin@pos.local is a PB superuser in the E2E box, same as the
// online-orders tour relies on). Returns the auth headers, or null if we can't authenticate.
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

// Enable the Bhutan NQRC payment QR on the settings singleton BEFORE the app boots, so the register's
// cached settings already carry the merchant config and the ONLINE PaymentQr actually renders.
async function seedSettings(headers: Record<string, string>) {
  const payload = {
    store_name: "Pelbu Demo Mart",
    nqrc_enabled: true, nqrc_merchant_name: "Pelbu Demo Mart", nqrc_merchant_city: "Thimphu",
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

// A demo product so the grid has a tappable card and the cart/payment flow can be shown.
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

// Incoming marketplace order + assigned rider + pickup OTP (mirrors the online-orders tour seed).
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

// Incoming wholesale (B2B) order awaiting fulfilment.
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

// A khata (credit) account so the Customers screen has a populated row to explain.
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

test("TOUR — Desktop onboarding for the shop owner (every screen explained)", async ({ appPage }) => {
  test.setTimeout(420_000);
  const page = appPage;

  // Seed everything BEFORE login so the register's initial queries already carry the demo data and
  // the NQRC settings. All seeds are best-effort — a schema mismatch degrades to caption-only callouts.
  const headers = await superAuth();
  if (headers) {
    await seedSettings(headers);
    await seedProduct(headers);
    await seedOnlineOrder(headers);
    await seedB2bOrder(headers);
    await seedCustomer(headers);
  }

  await ensureLoggedIn(page); // proven boot + login → lands on the POS register (app root)
  await injectOverlay(page); await beat(page, 800);
  await titleCard(page, {
    kicker: KICK,
    title: "Welcome to your terminal",
    sub: "A quick tour of every screen — the register, stock, cash, orders, customers and settings.",
  }, { hold: 3200 });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 1 — THE POS REGISTER (app root)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Switch to the touch grid so the product grid + cart panel are on screen (default is keyboard list).
  await page.locator('button[title="Touch card grid"]').click().catch(() => {});
  await beat(page, 900);
  await titleCard(page, {
    kicker: "DESKTOP · REGISTER",
    title: "The register",
    sub: "Where every in-store sale is rung up.",
  }, { hold: 2600 });

  await callout(page, 'img[alt="Pelbu"]', { step: 1, title: "Your shop", text: "Your store name and terminal identity sit top-left, always in view." });
  await callout(page, 'header .font-mono:has(svg)', { step: 2, title: "Next invoice", text: "The next invoice number. Double-click it to look up any past invoice." });
  await callout(page, 'header >> text=/^(Online|Offline)$/', { step: 3, title: "Connection", text: "Offline-resilient: the terminal keeps selling even when the internet drops." });
  await callout(page, "#pos-search", { step: 4, title: "Find a product", text: "Type here — or just start typing anywhere — to filter the catalogue instantly." });
  await callout(page, 'button:has-text("All")', { step: 5, title: "Categories", text: "Jump between product categories, or star favourites for one-tap access." });
  await callout(page, ".product-card", { step: 6, title: "The product grid", text: "Tap any card to drop that item straight into the cart." });

  // Header navigation — call out each button and who can use it.
  await callout(page, 'a[href="/online-orders"]', { step: 7, title: "Online orders", text: "Marketplace deliveries land here. Any signed-in staff can work them." });
  await callout(page, 'a[href="/customers"]', { step: 8, title: "Customers", text: "Khata (credit) accounts and balances. Open to all staff." });
  await callout(page, 'a[href="/stock"]', { step: 9, title: "Stock", text: "Products, inventory and restock — managers and owners only." });
  await callout(page, 'a[href="/adjustments"]', { step: 10, title: "Cash", text: "Cash in / cash out of the drawer — managers and owners only." });
  await callout(page, 'a[href="/settings"]', { step: 11, title: "Settings", text: "Terminal, printer and sync configuration — owner only (that's you)." });
  await callout(page, 'button:has-text("Open Shift"), button:has-text("Close Shift")', { step: 12, title: "Shifts", text: "Open a shift to track the drawer; close it to reconcile the till." });

  // Build a cart so we can explain totals and the payment flow. The initial schema seeds several
  // in-stock sample products, so the first grid card is always tappable (seed-independent).
  await page.locator(".product-card").first().click().catch(() => {});
  await beat(page, 1000);

  await callout(page, 'button:has-text("Walk-in Customer"), button:has-text("Tashi Dorji")', { step: 13, title: "Attach a customer", text: "Add a customer to sell on credit (khata) or build loyalty." });
  await callout(page, 'button:has-text("Tax Exempt"), button:has-text("GST Exempt")', { step: 14, title: "GST on the bill", text: "GST is a flat 5%. Flip the whole bill to exempt when it qualifies." });
  await callout(page, 'button:has-text("Pay Nu.")', { step: 15, title: "Checkout", text: "The running total. Tap to take payment." });

  // Open the payment modal and explain the methods + the new ONLINE counter flow.
  await page.getByRole("button", { name: /pay nu\./i }).first().click().catch(() => {});
  await page.getByText("Amount Due").first().waitFor({ timeout: 5000 }).catch(() => {});
  await beat(page, 800);
  await callout(page, 'button:has-text("mBoB")', { step: 16, title: "Payment methods", text: "Cash, mBoB, mPay, RTGS or Khata credit — pick how the customer pays." });

  // Choose an ONLINE method to reveal the QR → scan → journal-number flow.
  await page.getByRole("button", { name: "mBoB" }).click().catch(() => {});
  await beat(page, 900);
  await callout(page, "text=/Scan to pay Nu\\./", { step: 17, title: "Show the QR", text: "A Bhutan NQRC QR with the exact amount — the customer scans it with any bank app." });
  await callout(page, 'button:has-text("Scan receipt")', { step: 18, title: "Scan the receipt", text: "Point the camera at their payment confirmation — it reads the journal number for you." });
  await callout(page, 'input[placeholder="Enter transaction reference"]', { step: 19, title: "Journal number", text: "Or type the reference by hand. Then confirm to finish the sale." });
  await clearHighlight(page); await clearCaption(page);
  await page.keyboard.press("Escape").catch(() => {}); // close payment modal
  await beat(page, 900);

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 2 — STOCK (/stock.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/stock.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · STOCK", title: "Products & inventory", sub: "Add products, receive stock, and raise restock orders.", }, { hold: 2600 });

  await callout(page, 'button:has-text("Products & inventory")', { step: 20, title: "Two tabs", text: "Products & inventory here; Restock to purchase from your suppliers." });
  await callout(page, 'input[placeholder="Search name, SKU, or barcode"]', { step: 21, title: "Find stock", text: "Search by name, SKU or barcode — or scan a barcode with the camera." });
  await callout(page, 'button:has-text("Add product")', { step: 22, title: "Add a product", text: "Create a new product with pricing, HSN code and opening stock." });
  await callout(page, 'table tbody tr:first-child [title="Receive stock"]', { step: 23, title: "Receive stock", text: "Top up on-hand quantity when a delivery arrives — logs a stock movement." });
  await callout(page, 'table tbody tr:first-child [title="Print barcode label"]', { step: 24, title: "Print a label", text: "Print a shelf / barcode label for any product from the terminal." });

  // Open the product form to explain the GST-exempt toggle.
  await page.getByRole("button", { name: /add product/i }).click().catch(() => {});
  await page.getByText("Add Product").first().waitFor({ timeout: 5000 }).catch(() => {});
  await beat(page, 700);
  await callout(page, "#hsn", { step: 25, title: "HSN code", text: "The tax classification code — required so every sale is filed correctly." });
  await callout(page, "#sale_price", { step: 26, title: "Selling price", text: "What the customer pays. It can't exceed the MRP." });
  await callout(page, 'label:has-text("Sold by weight")', { step: 27, title: "Weighed goods", text: "Tick this for rice, veg or anything sold per-kg — the price becomes a per-unit rate." });
  await callout(page, 'label:has-text("GST exempt")', { step: 28, title: "GST-exempt product", text: "Tick to ring this item at 0% instead of the flat 5% — for exempt goods." });
  await clearHighlight(page); await clearCaption(page);
  await page.keyboard.press("Escape").catch(() => {});
  await beat(page, 700);
  await callout(page, 'button:has-text("Restock")', { step: 29, title: "Restock", text: "Switch here to add suppliers and raise purchase orders to your wholesaler." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 3 — CASH ADJUSTMENTS (/adjustments.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/adjustments.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · CASH", title: "Cash in & out", sub: "Track every non-sale cash movement in the drawer.", }, { hold: 2600 });

  await callout(page, "text=Cash In", { step: 30, title: "Money in", text: "Petty cash and float top-ups added to the drawer this shift." });
  await callout(page, "text=Cash Out", { step: 31, title: "Money out", text: "Payouts and expenses taken from the drawer — each with a reason." });
  await callout(page, "text=Net Adjustment", { step: 32, title: "Net movement", text: "The running effect on the expected drawer total at close." });
  await callout(page, 'button:has-text("Open Drawer")', { step: 33, title: "Open the drawer", text: "Kick the cash drawer open without ringing a sale." });
  await callout(page, 'button:has-text("Add Adjustment")', { step: 34, title: "Record a movement", text: "Log a cash-in or cash-out with an amount, reason and note (needs an open shift)." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 4 — ONLINE ORDERS (/online-orders.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/online-orders.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · ONLINE ORDERS", title: "Orders come to the counter", sub: "Marketplace orders land right here — even offline-resilient.", }, { hold: 2600 });
  await expect(page.getByText("MKT-TOUR-0001")).toBeVisible({ timeout: 20_000 }).catch(() => {});

  await callout(page, "text=MKT-TOUR-0001", { step: 35, title: "An incoming order", text: "New marketplace orders appear automatically, with the order number and total." });
  await callout(page, "text=Sonam", { step: 36, title: "Who it's for", text: "Customer name, phone and delivery address are all on the card." });
  await callout(page, "text=/Pickup code/", { step: 37, title: "Rider pickup code", text: "Hand this code to the rider at pickup — it confirms the right order left the shop." });
  await callout(page, 'button:has-text("Confirm")', { step: 38, title: "Work the order", text: "Confirm to accept and start preparing — or cancel with a reason, which returns stock." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 5 — B2B ORDERS (/b2b-orders.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/b2b-orders.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · B2B ORDERS", title: "Wholesale orders", sub: "Fulfil the orders your business customers place with you.", }, { hold: 2600 });
  await expect(page.getByText("WHS-TOUR-0001")).toBeVisible({ timeout: 20_000 }).catch(() => {});

  await callout(page, "text=WHS-TOUR-0001", { step: 39, title: "A wholesale order", text: "Orders your retailer customers place appear here with their total and payment terms." });
  await callout(page, "text=Norzin General Shop", { step: 40, title: "The buyer", text: "The buying shop, their phone and TPN — tap the phone to call." });
  await callout(page, 'button:has-text("Start processing")', { step: 41, title: "Fulfil it", text: "Move it along the chain — start processing, dispatch, deliver — or cancel." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 6 — CUSTOMERS (/customers.html)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/customers.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · CUSTOMERS", title: "Khata & credit", sub: "Your credit customers and what they owe.", }, { hold: 2600 });

  await callout(page, 'input[placeholder="Search customers..."]', { step: 42, title: "Find a customer", text: "Search by name or phone across all your credit accounts." });
  await callout(page, 'header button:has-text("Add")', { step: 43, title: "Add a customer", text: "Create a khata account and set a credit limit." });
  await callout(page, "text=Credit Limit", { step: 44, title: "Limit & balance", text: "Each row shows the credit limit, outstanding balance and account status." });
  await callout(page, 'table tbody tr:first-child button:has-text("Repay")', { step: 45, title: "Take a repayment", text: "Record a repayment against the balance — cash or digital." });
  await callout(page, 'table tbody tr:first-child button:has-text("Adjust")', { step: 46, title: "Adjust the balance", text: "Post an opening balance, write-off or correction." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 7 — SETTINGS (/settings.html)  — owner only
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/settings.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · SETTINGS", title: "Set up the terminal", sub: "Owner-only configuration for this station.", }, { hold: 2600 });

  await callout(page, "text=Store Profile", { step: 47, title: "Store profile", text: "Your shop name, address, TPN/GSTIN and GST rate — these print on every receipt." });
  await callout(page, "text=Receipt Customization", { step: 48, title: "Receipt text", text: "Add a header and footer line to the printed receipt." });
  await callout(page, "text=Thermal Printer", { step: 49, title: "Printer & drawer", text: "Pick the receipt printer, paper width, auto-print and cash-drawer kick." });
  await callout(page, "text=Barcode Labels", { step: 50, title: "Label printing", text: "Size and style the shelf / barcode labels this terminal prints." });
  await callout(page, "text=Central Sync", { step: 51, title: "Cloud sync", text: "Connect to the cloud to back up sales and pull the shared catalogue." });
  await callout(page, 'button:has-text("Sign Out")', { step: 52, title: "Sign out", text: "End your session — the terminal is ready for the next person." });

  // ── Outro ──
  await clearHighlight(page);
  await caption(page, { step: "", title: "That's the whole terminal", text: "Register, stock, cash, orders, customers and settings — all from one counter." }, 3400);
  await clearCaption(page); await beat(page, 900);
  // Video flushes when the fixture closes the window on teardown.
});
