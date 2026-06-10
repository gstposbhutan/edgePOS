/// <reference path="../pb_data/types.d.ts" />

// P2-2: local audit trail mirroring the web app (order_status_log + audit_logs).
//
// REQUEST hooks (onRecord*Request), not model hooks — only the request event carries
// the acting user (e.auth). Each logs AFTER e.next() persists, so only successful,
// user-driven changes are recorded. Logging is BEST-EFFORT: failures are logged and
// swallowed so the audit can never abort the underlying sale/refund/edit. Writes use
// the rule-bypassing app.save(), so the append-only API rules still hold.
//
// NOTE: PocketBase runs each hook handler in an ISOLATED scope — top-level helpers are
// NOT visible inside the callbacks (ReferenceError). So every handler is self-contained.

// 1. Order status transitions → order_status_log (mirrors web's orders_status_log).
onRecordUpdateRequest((e) => {
  const from = e.record.original().get("status");
  e.next(); // persist first; only log a change that actually committed
  const to = e.record.get("status");
  if (from === to) return;
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("order_status_log"));
    rec.set("order", e.record.id);
    rec.set("from_status", from);
    rec.set("to_status", to);
    rec.set("reason", e.record.get("cancellation_reason") || e.record.get("refund_reason") || "");
    rec.set("metadata", { at: new Date().toISOString() });
    if (e.auth) {
      rec.set("actor_role", String(e.auth.get("role") || ""));
      // created_by is a relation to `users`; only set it for a users-collection auth
      // (e.g. the superuser sync path is _superusers — skip to avoid an invalid relation).
      try { if (e.auth.collection().name === "users") rec.set("created_by", e.auth.id); } catch (_) {}
    }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("order_status_log write failed", "err", String(err));
  }
}, "orders");

// 2. Manual cash in/out → audit_logs (fraud-sensitive).
onRecordCreateRequest((e) => {
  e.next();
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "cash_adjustments");
    rec.set("record_id", e.record.id);
    rec.set("operation", "INSERT");
    rec.set("new_values", { amount: e.record.get("amount"), type: e.record.get("type"), reason: e.record.get("reason") });
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "cash_adjustments", "err", String(err));
  }
}, "cash_adjustments");

// 3. Credit-limit changes → audit_logs (NOT every balance move — those happen per sale).
onRecordUpdateRequest((e) => {
  const oldLimit = e.record.original().get("credit_limit");
  e.next();
  const newLimit = e.record.get("credit_limit");
  if (oldLimit === newLimit) return;
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "khata_accounts");
    rec.set("record_id", e.record.id);
    rec.set("operation", "UPDATE");
    rec.set("old_values", { credit_limit: oldLimit });
    rec.set("new_values", { credit_limit: newLimit });
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "khata_accounts", "err", String(err));
  }
}, "khata_accounts");

// 4. Product PRICE changes → audit_logs (current_stock moves on every sale — too noisy).
onRecordUpdateRequest((e) => {
  const o = e.record.original();
  const before = { sale_price: o.get("sale_price"), mrp: o.get("mrp"), wholesale_price: o.get("wholesale_price") };
  e.next();
  const after = { sale_price: e.record.get("sale_price"), mrp: e.record.get("mrp"), wholesale_price: e.record.get("wholesale_price") };
  if (before.sale_price === after.sale_price && before.mrp === after.mrp && before.wholesale_price === after.wholesale_price) return;
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "products");
    rec.set("record_id", e.record.id);
    rec.set("operation", "UPDATE");
    rec.set("old_values", before);
    rec.set("new_values", after);
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "products", "err", String(err));
  }
}, "products");

// 5. Product deletions → audit_logs (snapshot what was removed).
onRecordDeleteRequest((e) => {
  const snapshot = { name: e.record.get("name"), sku: e.record.get("sku") };
  const id = e.record.id;
  e.next();
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "products");
    rec.set("record_id", id);
    rec.set("operation", "DELETE");
    rec.set("old_values", snapshot);
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "products", "err", String(err));
  }
}, "products");

// 6. Store settings (tax rate, TPN, identity) changes → audit_logs.
onRecordUpdateRequest((e) => {
  const id = e.record.id;
  e.next();
  try {
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "settings");
    rec.set("record_id", id);
    rec.set("operation", "UPDATE");
    rec.set("new_values", { at: new Date().toISOString() });
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "settings", "err", String(err));
  }
}, "settings");

// 7. Discounted sales → audit_logs (P1-6: line-item discount accountability).
//    Logs the discounted lines of a new order so a manager can review who gave
//    what discount. The stored discount is the per-unit flat amount.
onRecordCreateRequest((e) => {
  e.next();
  try {
    const items = e.record.get("items");
    if (!items || typeof items.length !== "number") return;
    const discounted = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.discount && it.discount > 0) {
        discounted.push({ name: it.name, unit_price: it.unit_price, discount: it.discount, quantity: it.quantity });
      }
    }
    if (discounted.length === 0) return;
    const rec = new Record(e.app.findCollectionByNameOrId("audit_logs"));
    rec.set("table_name", "orders");
    rec.set("record_id", e.record.id);
    rec.set("operation", "INSERT");
    rec.set("new_values", { order_no: e.record.get("order_no"), discounts: discounted });
    if (e.auth) { rec.set("actor_id", e.auth.id); rec.set("actor_role", String(e.auth.get("role") || "")); }
    e.app.save(rec);
  } catch (err) {
    e.app.logger().error("audit_logs write failed", "table", "orders(discount)", "err", String(err));
  }
}, "orders");
