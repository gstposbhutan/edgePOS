/// <reference path="../pb_data/types.d.ts" />

// Registers = terminals. One cash_registers row per physical terminal, keyed by
// machine_id (MAC, resolved by the Electron main process). Mirrors the web app's
// cash_registers so a synced register maps 1:1. Every transactional record carries
// register_id so the cloud can tell which POS rang it (not just which cashier).
migrate(
  (app) => {
    const registers = new Collection({
      name: "cash_registers",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      deleteRule: "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')",
      fields: [
        { name: "machine_id", type: "text", required: true },
        { name: "name", type: "text", required: true },
        { name: "default_opening_float", type: "number", required: false, options: { default: 0 } },
        { name: "is_active", type: "bool", required: false, options: { default: true } },
        { name: "created_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "created_at", type: "autodate", onCreate: true },
        { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_cash_registers_machine` ON `cash_registers` (`machine_id`)",
      ],
    });
    app.save(registers);

    const reg = app.findCollectionByNameOrId("cash_registers");
    const targets = [
      ["orders", "regrel_orders01"],
      ["shifts", "regrel_shifts01"],
      ["inventory_movements", "regrel_invmov01"],
      ["cash_adjustments", "regrel_cashadj1"],
    ];
    for (const [name, fid] of targets) {
      const col = app.findCollectionByNameOrId(name);
      col.fields.add(new Field({
        id: fid,
        name: "register_id",
        type: "relation",
        required: false,
        collectionId: reg.id,
        cascadeDelete: false,
        maxSelect: 1,
        minSelect: 0,
      }));
      app.save(col);
    }
  },
  (app) => {
    const targets = [
      ["orders", "regrel_orders01"],
      ["shifts", "regrel_shifts01"],
      ["inventory_movements", "regrel_invmov01"],
      ["cash_adjustments", "regrel_cashadj1"],
    ];
    for (const [name, fid] of targets) {
      try {
        const col = app.findCollectionByNameOrId(name);
        col.fields.removeById(fid);
        app.save(col);
      } catch (e) {
        // field may already be gone
      }
    }
    try {
      const c = app.findCollectionByNameOrId("cash_registers");
      if (c) app.delete(c);
    } catch (e) {
      // collection may already be gone
    }
  }
);
