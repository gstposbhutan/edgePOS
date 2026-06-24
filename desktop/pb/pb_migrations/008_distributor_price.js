/// <reference path="../pb_data/types.d.ts" />

// products.distributor_price — third price tier (DISTRIBUTOR) for the POS
// price-list toggle. Mirrors web/supabase/migrations/077_distributor_price.sql.
// Nullable-by-design: the price-list ladder (lib/price-list.ts priceFor) falls
// back to wholesale_price → mrp when unset/0, so existing products keep working
// until an admin sets a distributor rate. Idempotent — safe to re-run.
migrate(
  (app) => {
    const products = app.findCollectionByNameOrId("products");
    let exists = false;
    try { products.fields.getByName("distributor_price"); exists = true; } catch (_) {}
    if (!exists) {
      products.fields.add(new NumberField({ name: "distributor_price" }));
      app.save(products);
    }
  },
  (app) => {
    const products = app.findCollectionByNameOrId("products");
    let exists = false;
    try { products.fields.getByName("distributor_price"); exists = true; } catch (_) {}
    if (exists) {
      products.fields.removeByName("distributor_price");
      app.save(products);
    }
  }
);
