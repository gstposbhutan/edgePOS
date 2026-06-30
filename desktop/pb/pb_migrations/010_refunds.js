/// <reference path="../pb_data/types.d.ts" />

// refunds collection — per-line return records for the Exchange flow. Desktop
// stores order items as a JSONB `items[]` on orders (no order_items table), so
// each refund pins its line via `order_item_id` (matching items[].id) and
// restores stock in the same PocketBase batch that creates it (see
// use-exchange.ts). Mirrors the web `refunds` table. Idempotent.
migrate(
  (app) => {
    let refunds = null;
    try { refunds = app.findCollectionByNameOrId("refunds"); } catch (_) {}
    if (refunds) return; // already exists

    const orders = app.findCollectionByNameOrId("orders");
    const products = app.findCollectionByNameOrId("products");
    const usersId = app.findCollectionByNameOrId("_pb_users_auth_").id;

    refunds = new Collection({
      name: "refunds",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "order", type: "relation", required: true, collectionId: orders.id, maxSelect: 1 },
        { name: "order_item_id", type: "text", required: true }, // matches items[].id on the order
        { name: "product", type: "relation", required: false, collectionId: products.id, maxSelect: 1 },
        { name: "quantity", type: "number", required: true, min: 1 },
        { name: "refund_type", type: "select", required: true, values: ["FULL", "PARTIAL"], options: { default: "PARTIAL" } },
        { name: "amount", type: "number", required: true, options: { default: 0 } },
        { name: "gst_reversal", type: "number", required: false, options: { default: 0 } },
        { name: "reason", type: "text", required: false },
        { name: "status", type: "select", required: true, values: ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"], options: { default: "REQUESTED" } },
        { name: "is_synced", type: "bool", required: false, options: { default: false } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(refunds);
  },
  (app) => {
    try { app.deleteCollection(app.findCollectionByNameOrId("refunds")); } catch (_) {}
  }
);
