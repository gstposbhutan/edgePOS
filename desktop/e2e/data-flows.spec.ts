import { test, expect } from "@playwright/test";
import PocketBase from "pocketbase";

// Core business-flow checks against a real PocketBase (schema + access rules + the
// same record shapes the hooks write). Driven through the PB API rather than the
// DOM so they're deterministic; the UI smoke tests (manager-pages, role-gating)
// cover rendering. Each test is self-contained and cleans up what it creates.

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
const OWNER = { email: "admin@pos.local", pass: "admin12345" };

function pb() {
  return new PocketBase(PB_URL);
}
async function asOwner() {
  const c = pb();
  await c.collection("users").authWithPassword(OWNER.email, OWNER.pass);
  return c;
}
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

test.describe("data flows", () => {
  test("product CRUD: create → read → update → delete", async () => {
    const c = await asOwner();
    const sku = uniq("SKU");
    const created = await c.collection("products").create({
      name: "Test Cola", sku, hsn_code: "2202", unit: "pcs",
      mrp: 50, sale_price: 45, cost_price: 30, current_stock: 100, reorder_point: 10, is_active: true,
    });
    expect(created.id).toBeTruthy();

    const read = await c.collection("products").getOne(created.id);
    expect(read.sku).toBe(sku);

    await c.collection("products").update(created.id, { sale_price: 48 });
    const updated = await c.collection("products").getOne(created.id);
    expect(updated.sale_price).toBe(48);

    await c.collection("products").delete(created.id);
    await expect(c.collection("products").getOne(created.id)).rejects.toThrow();
  });

  test("cash sale: order + stock decrement + SALE movement (atomic batch)", async () => {
    const c = await asOwner();
    const sku = uniq("SALE");
    const product = await c.collection("products").create({
      name: "Sale Item", sku, hsn_code: "1905", unit: "pcs",
      mrp: 100, sale_price: 100, current_stock: 20, reorder_point: 5, is_active: true,
    });
    const qty = 3;
    const orderNo = uniq("POS");

    const batch = c.createBatch();
    batch.collection("orders").create({
      order_no: orderNo, order_type: "POS_SALE", status: "CONFIRMED",
      items: [{ id: "i1", product: product.id, name: "Sale Item", quantity: qty, unit_price: 100, discount: 0, gst_5: 14.29, total: 300 }],
      subtotal: 285.71, gst_total: 14.29, grand_total: 300, payment_method: "CASH", is_synced: false,
    });
    batch.collection("products").update(product.id, { "current_stock-": qty });
    batch.collection("inventory_movements").create({
      product: product.id, movement_type: "SALE", quantity: -qty, notes: `Sale: ${orderNo}`,
    });
    await batch.send();

    const after = await c.collection("products").getOne(product.id);
    expect(after.current_stock).toBe(20 - qty);

    const order = await c.collection("orders").getFirstListItem(`order_no = "${orderNo}"`);
    expect(order.payment_method).toBe("CASH");
    const moves = await c.collection("inventory_movements").getFullList({ filter: `product = "${product.id}" && movement_type = "SALE"` });
    expect(moves.length).toBeGreaterThan(0);

    // cleanup
    await c.collection("orders").delete(order.id);
    for (const m of moves) await c.collection("inventory_movements").delete(m.id);
    await c.collection("products").delete(product.id);
  });

  test("purchase order: draft → receive bumps stock + RESTOCK movement", async () => {
    const c = await asOwner();
    const sku = uniq("PO");
    const product = await c.collection("products").create({
      name: "PO Item", sku, hsn_code: "1006", unit: "kg",
      mrp: 80, sale_price: 75, wholesale_price: 60, current_stock: 5, reorder_point: 10, is_active: true,
    });
    const wholesaler = await c.collection("wholesaler_connections").create({
      wholesaler_name: uniq("Wholesaler"), status: "ACTIVE",
    });
    const poNo = uniq("PONO");
    const recvQty = 25;
    const po = await c.collection("purchase_orders").create({
      po_no: poNo, status: "CONFIRMED", supplier_name: wholesaler.wholesaler_name,
      items: [{ product: product.id, name: "PO Item", sku, quantity: recvQty, unit_cost: 60, total: 1500 }],
      subtotal: 1500, gst_total: 75, grand_total: 1575, is_synced: false,
    });

    // Receive (mirrors usePurchases.receiveOrder)
    await c.collection("products").update(product.id, { "current_stock+": recvQty });
    await c.collection("inventory_movements").create({
      product: product.id, movement_type: "RESTOCK", quantity: recvQty, notes: `PO ${poNo}`,
    });
    await c.collection("purchase_orders").update(po.id, { status: "RECEIVED", received_at: new Date().toISOString() });

    const after = await c.collection("products").getOne(product.id);
    expect(after.current_stock).toBe(5 + recvQty);
    const poAfter = await c.collection("purchase_orders").getOne(po.id);
    expect(poAfter.status).toBe("RECEIVED");

    // cleanup
    const moves = await c.collection("inventory_movements").getFullList({ filter: `product = "${product.id}"` });
    for (const m of moves) await c.collection("inventory_movements").delete(m.id);
    await c.collection("purchase_orders").delete(po.id);
    await c.collection("wholesaler_connections").delete(wholesaler.id);
    await c.collection("products").delete(product.id);
  });

  test("khata: credit sale raises balance; freeze flag persists", async () => {
    const c = await asOwner();
    const acct = await c.collection("khata_accounts").create({
      debtor_name: uniq("Debtor"), debtor_phone: uniq("17"), credit_limit: 5000, outstanding_balance: 0, status: "ACTIVE",
    });

    // Credit sale effect on the ledger.
    await c.collection("khata_accounts").update(acct.id, { "outstanding_balance+": 1200 });
    await c.collection("khata_transactions").create({
      khata_account: acct.id, transaction_type: "DEBIT", amount: 1200, balance_after: 1200, notes: "Credit sale",
    });
    let a = await c.collection("khata_accounts").getOne(acct.id);
    expect(a.outstanding_balance).toBe(1200);

    // Freeze.
    await c.collection("khata_accounts").update(acct.id, { status: "FROZEN" });
    a = await c.collection("khata_accounts").getOne(acct.id);
    expect(a.status).toBe("FROZEN");

    // cleanup
    const txns = await c.collection("khata_transactions").getFullList({ filter: `khata_account = "${acct.id}"` });
    for (const t of txns) await c.collection("khata_transactions").delete(t.id);
    await c.collection("khata_accounts").delete(acct.id);
  });
});
