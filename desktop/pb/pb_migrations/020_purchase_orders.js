/// <reference path="../pb_data/types.d.ts" />

// Purchase orders — restock drafts raised on the terminal against a wholesaler connection, received
// into stock, and synced up. Mirrors setup-pb.js + the cloud. Idempotent.
migrate(
  (app) => {
    try { app.findCollectionByNameOrId("purchase_orders"); return; } catch (_) { /* create below */ }
    const entities = app.findCollectionByNameOrId("entities").id;
    const c = new Collection({
      name: "purchase_orders",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      updateRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      deleteRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      fields: [
        { name: "po_no", type: "text", required: true },
        { name: "status", type: "text", required: true },
        { name: "supplier", type: "relation", required: false, collectionId: entities, maxSelect: 1, minSelect: 0, cascadeDelete: false },
        { name: "supplier_name", type: "text", required: false },
        { name: "items", type: "json", required: false, maxSize: 2000000 },
        { name: "subtotal", type: "number", required: false, options: { default: 0 } },
        { name: "gst_total", type: "number", required: false, options: { default: 0 } },
        { name: "grand_total", type: "number", required: false, options: { default: 0 } },
        { name: "notes", type: "text", required: false },
        { name: "expected_at", type: "date", required: false },
        { name: "submitted_at", type: "date", required: false },
        { name: "confirmed_at", type: "date", required: false },
        { name: "received_at", type: "date", required: false },
        { name: "entity_id", type: "relation", required: false, collectionId: entities, maxSelect: 1, minSelect: 0, cascadeDelete: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "is_synced", type: "bool", required: false, options: { default: false } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(c);
  },
  (app) => {
    try { const c = app.findCollectionByNameOrId("purchase_orders"); if (c) app.delete(c); } catch (_) { /* already gone */ }
  }
);
