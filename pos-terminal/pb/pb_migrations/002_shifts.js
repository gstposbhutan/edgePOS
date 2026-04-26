/// <reference path="../pb_data/types.d.ts" />

migrate(
  (db) => {
    // ── Shift Records ────────────────────────────────────────────────────────
    const shifts = new Collection({
      name: "shifts",
      type: "base",
      schema: [
        { name: "opened_by", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1 } },
        { name: "closed_by", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", maxSelect: 1 } },
        { name: "opening_float", type: "number", required: true, options: { default: 0, min: 0 } },
        { name: "closing_count", type: "number", required: false, options: { default: 0, min: 0 } },
        { name: "expected_total", type: "number", required: false, options: { default: 0 } },
        { name: "discrepancy", type: "number", required: false, options: { default: 0 } },
        { name: "status", type: "select", required: true, options: { values: ["active", "closing", "closed"], default: "active" } },
        { name: "opened_at", type: "date", required: true, options: { default: "now" } },
        { name: "closed_at", type: "date", required: false },
        { name: "cash_sales", type: "number", required: false, options: { default: 0 } },
        { name: "digital_sales", type: "number", required: false, options: { default: 0 } },
        { name: "credit_sales", type: "number", required: false, options: { default: 0 } },
        { name: "refund_total", type: "number", required: false, options: { default: 0 } },
        { name: "transaction_count", type: "number", required: false, options: { default: 0 } },
      ],
      indexes: [
        "CREATE INDEX idx_shifts_status ON shifts (status)",
        "CREATE INDEX idx_shifts_date ON shifts (opened_at)",
      ],
    });
    db.saveCollection(shifts);

    // ── Shift Orders junction ────────────────────────────────────────────────
    // We link orders to shifts via an order field update, but for now we can
    // query orders by date range. No separate junction needed.
  },
  (db) => {
    db.deleteCollection("shifts");
  }
);
