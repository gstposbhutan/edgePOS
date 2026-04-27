/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ── Shift Records ────────────────────────────────────────────────────────
    const shifts = new Collection({
      name: "shifts",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "opened_by", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "closed_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "opening_float", type: "number", required: true, min: 0, options: { default: 0 } },
        { name: "closing_count", type: "number", required: false, min: 0, options: { default: 0 } },
        { name: "expected_total", type: "number", required: false, options: { default: 0 } },
        { name: "discrepancy", type: "number", required: false, options: { default: 0 } },
        { name: "status", type: "select", required: true, values: ["active", "closing", "closed"], options: { default: "active" } },
        { name: "opened_at", type: "date", required: true },
        { name: "closed_at", type: "date", required: false },
        { name: "cash_sales", type: "number", required: false, options: { default: 0 } },
        { name: "digital_sales", type: "number", required: false, options: { default: 0 } },
        { name: "credit_sales", type: "number", required: false, options: { default: 0 } },
        { name: "refund_total", type: "number", required: false, options: { default: 0 } },
        { name: "transaction_count", type: "number", required: false, options: { default: 0 } },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(shifts);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("shifts");
    if (c) app.delete(c);
  }
);
