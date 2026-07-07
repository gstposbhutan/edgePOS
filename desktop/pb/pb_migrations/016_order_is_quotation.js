/// <reference path="../pb_data/types.d.ts" />

// Sell-side fold parity: a saved DRAFT SALES_ORDER is either a committed Sales Order
// or a non-binding Quotation. Mirrors web cloud migration 098 (orders.is_quotation).
// Bool, default false = Sales Order. Idempotent — safe to re-run.
migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    const has = (coll, name) => {
      try { coll.fields.getByName(name); return true; } catch (_) { return false; }
    };
    if (!has(orders, "is_quotation")) {
      orders.fields.add(new BoolField({ name: "is_quotation" }));
    }
    app.save(orders);
  },
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    try { orders.fields.removeByName("is_quotation"); } catch (_) {}
    app.save(orders);
  }
);
