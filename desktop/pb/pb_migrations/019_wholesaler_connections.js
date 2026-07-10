/// <reference path="../pb_data/types.d.ts" />

// Wholesaler connections — the suppliers a terminal can raise a restock (purchase order) against.
// Mirrors setup-pb.js + the cloud so restock works offline on a real terminal. Idempotent.
migrate(
  (app) => {
    try { app.findCollectionByNameOrId("wholesaler_connections"); return; } catch (_) { /* create below */ }
    const entities = app.findCollectionByNameOrId("entities").id;
    const c = new Collection({
      name: "wholesaler_connections",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      updateRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      deleteRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      fields: [
        { name: "wholesaler", type: "relation", required: false, collectionId: entities, maxSelect: 1, minSelect: 0, cascadeDelete: false },
        { name: "wholesaler_name", type: "text", required: true },
        { name: "wholesaler_phone", type: "text", required: false },
        { name: "tpn_gstin", type: "text", required: false },
        { name: "status", type: "text", required: false },
        { name: "notes", type: "text", required: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(c);
  },
  (app) => {
    try { const c = app.findCollectionByNameOrId("wholesaler_connections"); if (c) app.delete(c); } catch (_) { /* already gone */ }
  }
);
