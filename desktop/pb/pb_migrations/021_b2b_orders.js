/// <reference path="../pb_data/types.d.ts" />

// Local mirror of the INCOMING B2B (WHOLESALE) orders a distributor/wholesaler BACK_OFFICE terminal
// must fulfil — orders where this store is the seller. Pulled from the cloud by the Electron main
// process (electron/main.js pollB2bOrders → GET /api/sync/wholesale-orders) and written only by the
// embedded superuser; the renderer reads it (app/b2b-orders). Mirrors 017_online_orders.
//
// Boot-safety: guarded with findCollectionByNameOrId so a re-run (or a Clear & Re-sync that wipes
// pb_data and replays every migration) never throws and aborts PocketBase startup. The unique index
// is WHERE-less (no parentheses) — see 011_shift_active_unique.js for the paren gotcha that bricked
// v1.0.2 boot.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("b2b_orders");
      return; // already exists — nothing to do
    } catch (_) { /* not found — create it */ }

    const c = new Collection({
      name: "b2b_orders",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null, // superuser-only (main process); renderer never writes
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "cloud_id", type: "text", required: true },      // cloud order UUID (dedup key)
        { name: "order_no", type: "text", required: false },
        { name: "status", type: "text", required: false },
        { name: "payment_method", type: "text", required: false },
        { name: "buyer_name", type: "text", required: false },
        { name: "buyer_phone", type: "text", required: false },
        { name: "buyer_tpn", type: "text", required: false },
        { name: "subtotal", type: "number", required: false, options: { default: 0 } },
        { name: "gst_total", type: "number", required: false, options: { default: 0 } },
        { name: "grand_total", type: "number", required: false, options: { default: 0 } },
        { name: "items", type: "json", required: false, options: { default: "[]" } },
        { name: "created_at_cloud", type: "text", required: false },
        { name: "last_seen", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_b2b_orders_cloud_id` ON `b2b_orders` (`cloud_id`)",
      ],
    });
    app.save(c);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("b2b_orders");
      if (c) app.delete(c);
    } catch (_) { /* already gone */ }
  }
);
