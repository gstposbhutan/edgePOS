/// <reference path="../pb_data/types.d.ts" />

// orders.invoice_date — the date stamped on the invoice (GST reporting). Mirrors
// web/supabase/migrations/076_invoice_date.sql. PocketBase has no TIMESTAMPTZ;
// the "date" field stores an ISO string. New sales write invoice_date at
// checkout (nowISO(), or an admin override — see use-checkout.ts); pre-existing
// rows leave it unset and continue to use created_at. Idempotent — safe to
// re-run on a DB that already has the column.
migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    let exists = false;
    try { orders.fields.getByName("invoice_date"); exists = true; } catch (_) {}
    if (!exists) {
      orders.fields.add(new DateField({ name: "invoice_date" }));
      app.save(orders);
    }
  },
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    let exists = false;
    try { orders.fields.getByName("invoice_date"); exists = true; } catch (_) {}
    if (exists) {
      orders.fields.removeByName("invoice_date");
      app.save(orders);
    }
  }
);
