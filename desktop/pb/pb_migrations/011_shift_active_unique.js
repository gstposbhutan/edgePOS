/// <reference path="../pb_data/types.d.ts" />

// One live shift per register. Mirrors the web guard (idx_shifts_one_active_per_register):
// a partial unique index so a register can have at most one shift in active/closing at a
// time, while any number of closed shifts coexist. SQLite (PocketBase's engine) supports
// partial indexes via the WHERE clause. This is the atomic backstop for the open-shift
// check-then-insert race in use-shifts.ts.
migrate(
  (app) => {
    const shifts = app.findCollectionByNameOrId("shifts");
    shifts.indexes = [
      ...shifts.indexes,
      "CREATE UNIQUE INDEX `idx_shifts_one_active` ON `shifts` (`register_id`) WHERE `status` IN ('active', 'closing')",
    ];
    app.save(shifts);
  },
  (app) => {
    const shifts = app.findCollectionByNameOrId("shifts");
    shifts.indexes = shifts.indexes.filter(
      (idx) => !idx.includes("idx_shifts_one_active")
    );
    app.save(shifts);
  }
);
