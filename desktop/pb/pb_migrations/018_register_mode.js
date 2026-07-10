/// <reference path="../pb_data/types.d.ts" />

// Register mode parity with cloud migration 104: a terminal runs as a full POS (rings cash
// sales) or a stock-only BACK_OFFICE terminal (stock + online orders, no cash sale). The mode
// is pushed down from the cloud (license .lic payload / sync bootstrap). Default POS so an
// already-activated terminal keeps ringing sales. Idempotent — safe to re-run.
migrate(
  (app) => {
    const registers = app.findCollectionByNameOrId("cash_registers");
    const has = (coll, name) => {
      try { coll.fields.getByName(name); return true; } catch (_) { return false; }
    };
    if (!has(registers, "mode")) {
      registers.fields.add(new TextField({ name: "mode" }));
    }
    app.save(registers);
  },
  (app) => {
    const registers = app.findCollectionByNameOrId("cash_registers");
    try { registers.fields.removeByName("mode"); } catch (_) {}
    app.save(registers);
  }
);
