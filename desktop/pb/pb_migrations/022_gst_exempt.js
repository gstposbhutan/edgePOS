/// <reference path="../pb_data/types.d.ts" />

// GST-exempt goods (0% instead of the flat 5%). Mirrors web migration 115
// (products.gst_exempt + order_items.gst_exempt). A product is either standard 5%
// or exempt; the flag rides on each cart line so qty/discount/price recomputes and
// the order snapshot keep the line's GST at 0. Idempotent — safe to re-run.
migrate(
  (app) => {
    for (const col of ["products", "cart_items"]) {
      const c = app.findCollectionByNameOrId(col);
      let exists = false;
      try { c.fields.getByName("gst_exempt"); exists = true; } catch (_) {}
      if (!exists) {
        c.fields.add(new BoolField({ name: "gst_exempt" }));
        app.save(c);
      }
    }
  },
  (app) => {
    for (const col of ["products", "cart_items"]) {
      const c = app.findCollectionByNameOrId(col);
      let exists = false;
      try { c.fields.getByName("gst_exempt"); exists = true; } catch (_) {}
      if (exists) {
        c.fields.removeByName("gst_exempt");
        app.save(c);
      }
    }
  }
);
