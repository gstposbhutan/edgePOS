import { test, OWNER } from "./tour-app-fixture";
import type { Page } from "@playwright/test";
import { injectOverlay, titleCard, caption, clearCaption, clearHighlight, callout, beat } from "../lib/tour-overlay";

// GUIDED TOUR — Desktop terminal ONBOARDING for a CASHIER on a POS-mode terminal. A cashier only gets
// the till, online orders and customers — Stock, Cash and Settings are hidden. Like the owner tour it
// EXPLAINS EVERY SCREEN with spotlit callout()s, but from the cashier's (deliberately narrower) seat.
// Same baked-in overlays (title card + captions + spotlights) as the web tours; recorded via
// tour-app-fixture (recordVideo).
//   xvfb-run -a npx playwright test --config playwright.electron.config.ts e2e/electron/tour-onboard-desktop-cashier.spec.ts
const PB = "http://127.0.0.1:8090";
const APP = "http://127.0.0.1:3200";
const KICK = "DESKTOP · TERMINAL — CASHIER";

// A dedicated cashier login, seeded into the `users` collection (role: cashier) the same way the
// fixture ensures the owner. The desktop login flow (pb.collection('users').authWithPassword) accepts
// any seeded user, so the terminal boots straight into the cashier's (role-gated) view.
const CASHIER = { email: "cashier@pos.local", password: "cashier12345", name: "E2E Cashier" };

// One shared superuser session (admin@pos.local is a PB superuser in the E2E box, same as the owner
// tour relies on). Returns the auth headers, or null if we can't authenticate.
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

// Create the cashier user (idempotent). role defaults to cashier in the schema, but we set it
// explicitly so the header hides Stock/Cash/Settings and page guards bounce them.
async function seedCashier(headers: Record<string, string>) {
  const ex = await fetch(`${PB}/api/collections/users/records?filter=${encodeURIComponent(`email="${CASHIER.email}"`)}`, { headers })
    .then((r) => r.json()).catch(() => ({ items: [] }));
  if (ex.items?.length) return;
  await fetch(`${PB}/api/collections/users/records`, {
    method: "POST", headers, body: JSON.stringify({
      email: CASHIER.email, password: CASHIER.password, passwordConfirm: CASHIER.password,
      name: CASHIER.name, role: "cashier",
    }),
  }).catch(() => {});
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

// Sign in as the seeded cashier. Defensively clears any persisted session (a prior tour in the same
// worker may have logged in as the owner), reloads to the login form, then signs in. All-tolerant per
// the tour house style — no brittle expect() gates.
async function loginAsCashier(page: Page) {
  await page.goto(`${APP}/`).catch(() => {});
  await page.evaluate(() => { try { localStorage.removeItem("pb_auth"); } catch { /* ignore */ } }).catch(() => {});
  await page.goto(`${APP}/`).catch(() => {});
  const email = page.locator("#email");
  await email.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  if (await email.isVisible().catch(() => false)) {
    await email.fill(CASHIER.email).catch(() => {});
    await page.locator("#password").fill(CASHIER.password).catch(() => {});
    await page.getByRole("button", { name: /sign in/i }).click().catch(() => {});
  }
  // POS rendered once the (role-independent) shift control shows.
  await page.getByRole("button", { name: /open shift|close shift/i }).first()
    .waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
}

test("TOUR — Desktop onboarding for a cashier (register + online orders + customers)", async ({ appPage }) => {
  test.setTimeout(420_000);
  const page = appPage;

  // Seed everything BEFORE login so the register's initial queries already carry the demo data and the
  // NQRC settings, and the cashier account exists to sign in with. All seeds are best-effort — a schema
  // mismatch degrades to caption-only callouts.
  const headers = await superAuth();
  if (headers) {
    await seedCashier(headers);
    await seedSettings(headers);
    await seedProduct(headers);
    await seedOnlineOrder(headers);
    await seedCustomer(headers);
  }

  await loginAsCashier(page); // boots the terminal into the cashier's POS view
  await injectOverlay(page); await beat(page, 800);
  await titleCard(page, {
    kicker: KICK,
    title: "Welcome to the till",
    sub: "A cashier's tour — the register, online orders and customers, and what stays out of reach.",
  }, { hold: 3200 });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 1 — THE POS REGISTER (app root) — the cashier's home
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Switch to the touch grid so the product grid + cart panel are on screen (default is keyboard list).
  await page.locator('button[title="Touch card grid"]').click().catch(() => {});
  await beat(page, 900);
  await titleCard(page, {
    kicker: "DESKTOP · REGISTER",
    title: "The register",
    sub: "Where you ring up every in-store sale.",
  }, { hold: 2600 });

  await callout(page, 'img[alt="Pelbu"]', { step: 1, title: "Your shop", text: "The store name and terminal identity sit top-left, always in view." });
  await callout(page, 'header .font-mono:has(svg)', { step: 2, title: "Next invoice", text: "The next invoice number. Double-click it to look up any past invoice." });
  await callout(page, 'header >> text=/^(Online|Offline)$/', { step: 3, title: "Connection", text: "Offline-resilient: the till keeps selling even when the internet drops." });
  await callout(page, "#pos-search", { step: 4, title: "Find a product", text: "Type here — or just start typing anywhere — to filter the catalogue instantly." });
  await callout(page, 'button:has-text("All")', { step: 5, title: "Categories", text: "Jump between product categories, or star favourites for one-tap access." });
  await callout(page, ".product-card", { step: 6, title: "The product grid", text: "Tap any card to drop that item straight into the cart." });

  // The two nav buttons a cashier DOES get — then spotlight what's deliberately missing.
  await callout(page, 'a[href="/online-orders"]', { step: 7, title: "Online orders", text: "Marketplace deliveries land here — a cashier can accept and prep them." });
  await callout(page, 'a[href="/customers"]', { step: 8, title: "Customers", text: "Khata (credit) accounts and balances — open to every signed-in cashier." });
  await clearHighlight(page);
  await caption(page, { step: 9, title: "What a cashier can't see", text: "No Stock, no Cash drawer, no Settings — those are manager/owner tools and stay hidden here." }, 3200);

  // Build a cart so we can explain the customer/GST/checkout controls and the payment flow. The initial
  // schema seeds several in-stock products, so the first grid card is always tappable (seed-independent).
  await page.locator(".product-card").first().click().catch(() => {});
  await beat(page, 1000);

  await callout(page, 'button:has-text("Walk-in Customer"), button:has-text("Tashi Dorji")', { step: 10, title: "Attach a customer", text: "Add a customer to sell on credit (khata) or build loyalty." });
  await callout(page, 'button:has-text("Tax Exempt"), button:has-text("GST Exempt")', { step: 11, title: "GST on the bill", text: "GST is a flat 5%. Flip the whole bill to exempt when it qualifies." });
  await callout(page, 'button:has-text("Pay Nu.")', { step: 12, title: "Checkout", text: "The running total. Tap to take payment." });

  // Open the payment modal and explain the methods + the ONLINE (NQRC QR) counter flow.
  await page.getByRole("button", { name: /pay nu\./i }).first().click().catch(() => {});
  await page.getByText("Amount Due").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await beat(page, 800);
  await callout(page, 'button:has-text("mBoB")', { step: 13, title: "Payment methods", text: "Cash, mBoB, mPay, RTGS or Khata credit — pick how the customer pays." });

  // Choose an ONLINE method to reveal the QR → scan → journal-number flow.
  await page.getByRole("button", { name: "mBoB" }).click().catch(() => {});
  await beat(page, 900);
  await callout(page, "text=/Scan to pay Nu\\./", { step: 14, title: "Show the QR", text: "A Bhutan NQRC QR with the exact amount — the customer scans it with any bank app." });
  await callout(page, 'button:has-text("Scan receipt")', { step: 15, title: "Scan the receipt", text: "Point the camera at their payment confirmation — it reads the journal number for you." });
  await callout(page, 'input[placeholder="Enter transaction reference"]', { step: 16, title: "Journal number", text: "Or type the reference by hand. Then confirm to finish the sale." });
  await clearHighlight(page); await clearCaption(page);
  await page.keyboard.press("Escape").catch(() => {}); // close payment modal
  await beat(page, 900);

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 2 — ONLINE ORDERS (/online-orders.html) — cashier can work these
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/online-orders.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · ONLINE ORDERS", title: "Orders come to the counter", sub: "Marketplace orders land right here — a cashier accepts and preps them.", }, { hold: 2600 });
  await page.getByText("MKT-TOUR-0001").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

  await callout(page, "text=MKT-TOUR-0001", { step: 17, title: "An incoming order", text: "New marketplace orders appear automatically, with the order number and total." });
  await callout(page, "text=Sonam", { step: 18, title: "Who it's for", text: "Customer name, phone and delivery address are all on the card." });
  await callout(page, "text=/Pickup code/", { step: 19, title: "Rider pickup code", text: "Hand this code to the rider at pickup — it confirms the right order left the shop." });
  await callout(page, 'button:has-text("Confirm")', { step: 20, title: "Work the order", text: "Confirm to accept and start preparing — or cancel with a reason, which returns stock." });

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // SCREEN 3 — CUSTOMERS (/customers.html) — open to every cashier
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${APP}/customers.html`); await injectOverlay(page); await beat(page, 1200);
  await titleCard(page, { kicker: "DESKTOP · CUSTOMERS", title: "Khata & credit", sub: "Your credit customers and what they owe.", }, { hold: 2600 });

  await callout(page, 'input[placeholder="Search customers..."]', { step: 21, title: "Find a customer", text: "Search by name or phone across all your credit accounts." });
  await callout(page, 'header button:has-text("Add")', { step: 22, title: "Add a customer", text: "Create a khata account and set a credit limit." });
  await callout(page, "text=Credit Limit", { step: 23, title: "Limit & balance", text: "Each row shows the credit limit, outstanding balance and account status." });
  await callout(page, 'table tbody tr:first-child button:has-text("Repay")', { step: 24, title: "Take a repayment", text: "Record a repayment against the balance — cash or digital." });
  await callout(page, 'table tbody tr:first-child button:has-text("Adjust")', { step: 25, title: "Adjust the balance", text: "Post an opening balance, write-off or correction." });

  // ── Outro ──
  await clearHighlight(page);
  await caption(page, { step: "", title: "That's the cashier's counter", text: "Ring sales, take payment, work online orders and manage khata — all from one screen." }, 3400);
  await clearCaption(page); await beat(page, 900);
  // Video flushes when the fixture closes the window on teardown.
});
