/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const shiftsCollection = app.findCollectionByNameOrId("shifts");

    const cashAdjustments = new Collection({
      name: "cash_adjustments",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "amount", type: "number", required: true, options: { default: 0 } },
        { name: "type", type: "text", required: true },
        { name: "reason", type: "text", required: true },
        { name: "notes", type: "text", required: false },
        { name: "shift", type: "relation", required: true, collectionId: shiftsCollection.id, maxSelect: 1 },
        { name: "created_by", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(cashAdjustments);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("cash_adjustments");
    if (c) app.delete(c);
  }
);
