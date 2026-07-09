/// <reference path="../pb_data/types.d.ts" />

// Local mirror of this store's ONLINE (marketplace) orders, pulled from the cloud by the Electron
// main process (see electron/main.js pollOnlineOrders). Lets the shopkeeper manage incoming online
// orders and read the rider the pickup OTP from the terminal, and keeps the last-known list visible
// during a brief internet outage (offline-first). Written only by the embedded superuser (main);
// the renderer reads it.
migrate(
  (app) => {
    const c = new Collection({
      name: "online_orders",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null, // superuser-only (main process); renderer never writes
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "cloud_id", type: "text", required: true },        // cloud order UUID (dedup key)
        { name: "order_no", type: "text", required: false },
        { name: "status", type: "text", required: false },
        { name: "dispatch_state", type: "text", required: false }, // ASSIGNED/SEARCHING/UNDELIVERABLE
        { name: "fulfilment_mode", type: "text", required: false },
        { name: "grand_total", type: "number", required: false, options: { default: 0 } },
        { name: "gst_total", type: "number", required: false, options: { default: 0 } },
        { name: "subtotal", type: "number", required: false, options: { default: 0 } },
        { name: "items", type: "json", required: false, options: { default: "[]" } },
        { name: "customer_name", type: "text", required: false },
        { name: "customer_phone", type: "text", required: false },
        { name: "customer_email", type: "text", required: false },
        { name: "delivery_address", type: "text", required: false },
        { name: "delivery_lat", type: "number", required: false },
        { name: "delivery_lng", type: "number", required: false },
        { name: "pickup_otp", type: "text", required: false },     // shared with the rider at pickup
        { name: "rider_name", type: "text", required: false },
        { name: "created_at_cloud", type: "text", required: false },
        { name: "last_seen", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_online_orders_cloud_id` ON `online_orders` (`cloud_id`)",
      ],
    });
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("online_orders");
    if (c) app.delete(c);
  }
);
