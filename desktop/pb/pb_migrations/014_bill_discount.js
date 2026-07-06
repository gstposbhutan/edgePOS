/// <reference path="../pb_data/types.d.ts" />

// carts.bill_discount + orders.bill_discount — invoice/bill-level discount: a single pre-GST amount
// off the net subtotal (after per-line discounts), NOT distributed across line items. Mirrors the
// web schema (migration 086). Idempotent — safe to re-run.
migrate(
  (app) => {
    for (const col of ["carts", "orders"]) {
      const c = app.findCollectionByNameOrId(col);
      let has = false;
      try { c.fields.getByName("bill_discount"); has = true; } catch (_) { has = false; }
      if (!has) c.fields.add(new NumberField({ name: "bill_discount" }));
      app.save(c);
    }
  },
  (app) => {
    for (const col of ["carts", "orders"]) {
      const c = app.findCollectionByNameOrId(col);
      try { c.fields.removeByName("bill_discount"); } catch (_) {}
      app.save(c);
    }
  }
);
