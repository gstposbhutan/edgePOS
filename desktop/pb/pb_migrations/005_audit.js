/// <reference path="../pb_data/types.d.ts" />

// P2-2: local audit trail mirroring the web app's order_status_log + audit_logs.
// Both are APPEND-ONLY over the API (no create/update/delete rules) — the audit hook
// (pb_hooks/audit.pb.js) writes them via a direct, rule-bypassing app.save(), so a
// cashier cannot forge or erase the trail through the PocketBase API. Gives the
// terminal a compliance/fraud record of order status transitions + sensitive changes.
migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("orders");

    const statusLog = new Collection({
      name: "order_status_log",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "order", type: "relation", required: true, collectionId: orders.id, maxSelect: 1, cascadeDelete: true },
        { name: "from_status", type: "text", required: false },
        { name: "to_status", type: "text", required: true },
        { name: "reason", type: "text", required: false },
        { name: "metadata", type: "json", required: false },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "actor_role", type: "text", required: false },
        { name: "created_at", type: "autodate", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_order_status_log_order` ON `order_status_log` (`order`)",
      ],
    });
    app.save(statusLog);

    const auditLogs = new Collection({
      name: "audit_logs",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "table_name", type: "text", required: true },
        { name: "record_id", type: "text", required: false },
        { name: "operation", type: "select", required: true, values: ["INSERT", "UPDATE", "DELETE"] },
        { name: "old_values", type: "json", required: false },
        { name: "new_values", type: "json", required: false },
        { name: "actor_id", type: "text", required: false },
        { name: "actor_role", type: "text", required: false },
        { name: "created_at", type: "autodate", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_audit_logs_table`  ON `audit_logs` (`table_name`)",
        "CREATE INDEX `idx_audit_logs_record` ON `audit_logs` (`record_id`)",
      ],
    });
    app.save(auditLogs);
  },
  (app) => {
    for (const n of ["order_status_log", "audit_logs"]) {
      try {
        const c = app.findCollectionByNameOrId(n);
        if (c) app.delete(c);
      } catch (e) {
        // collection may already be gone
      }
    }
  }
);
