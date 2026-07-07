/// <reference path="../pb_data/types.d.ts" />

// cart_items.salesperson_id — salesperson moves from invoice-level (orders.salesperson_id) to PER-LINE.
// Each cart line records the staff member who sold it; the order items JSONB snapshot carries it too
// (no column needed there — orders.items is JSON). Mirrors web migration 087. Idempotent.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("cart_items");
    let has = false;
    try { c.fields.getByName("salesperson_id"); has = true; } catch (_) { has = false; }
    if (!has) c.fields.add(new TextField({ name: "salesperson_id" }));
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("cart_items");
    try { c.fields.removeByName("salesperson_id"); } catch (_) {}
    app.save(c);
  }
);
