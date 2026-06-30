/// <reference path="../pb_data/types.d.ts" />

// Phase 4 schema for the six new POS flows. Mirrors web migration 078
// (orders.salesperson_id) + the web baseline (delivery_address, visible_on_web)
// + quotation support (order_type += SALES_ORDER). Idempotent — safe to re-run.
migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");
    const products = app.findCollectionByNameOrId("products");
    const usersId = app.findCollectionByNameOrId("_pb_users_auth_").id;

    const has = (coll, name) => {
      try { coll.fields.getByName(name); return true; } catch (_) { return false; }
    };

    if (!has(orders, "salesperson_id")) {
      orders.fields.add(new RelationField({ name: "salesperson_id", required: false, collectionId: usersId, maxSelect: 1 }));
    }
    if (!has(orders, "delivery_address")) {
      orders.fields.add(new TextField({ name: "delivery_address" }));
    }
    if (!has(orders, "complimentary_reason")) {
      orders.fields.add(new TextField({ name: "complimentary_reason" }));
    }
    // order_type += SALES_ORDER (quotations are drafted as SALES_ORDER + DRAFT).
    const ot = orders.fields.getByName("order_type");
    if (ot && Array.isArray(ot.values) && ot.values.indexOf("SALES_ORDER") === -1) {
      ot.values = ot.values.concat(["SALES_ORDER"]);
    }
    app.save(orders);

    // Post to Market: products.visible_on_web. is_synced lets doSync push the
    // change (products weren't previously sync-flagged). Both bool, default false.
    if (!has(products, "visible_on_web")) {
      products.fields.add(new BoolField({ name: "visible_on_web" }));
    }
    if (!has(products, "is_synced")) {
      products.fields.add(new BoolField({ name: "is_synced" }));
    }
    app.save(products);
  },
  (app) => {
    // Down: drop the added fields. We deliberately leave any SALES_ORDER enum
    // value in place (removing a select value that rows already use is risky).
    const orders = app.findCollectionByNameOrId("orders");
    const products = app.findCollectionByNameOrId("products");
    ["salesperson_id", "delivery_address", "complimentary_reason"].forEach((n) => {
      try { orders.fields.removeByName(n); } catch (_) {}
    });
    ["visible_on_web", "is_synced"].forEach((n) => {
      try { products.fields.removeByName(n); } catch (_) {}
    });
    app.save(orders);
    app.save(products);
  }
);
