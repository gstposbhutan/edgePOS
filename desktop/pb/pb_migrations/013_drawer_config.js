/// <reference path="../pb_data/types.d.ts" />

// settings.printer_open_drawer — pop the cash drawer on CASH sales (opt-in). The drawer is
// wired to the receipt printer's RJ11 port; the kick is a raw ESC/POS pulse sent to the printer
// via the Windows spooler (electron/drawer.js). Default is applied in hooks/use-settings.ts.
// Idempotent — safe to re-run.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    const has = (name) => {
      try { settings.fields.getByName(name); return true; } catch (_) { return false; }
    };
    if (!has("printer_open_drawer")) {
      settings.fields.add(new BoolField({ name: "printer_open_drawer" }));
    }
    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    try { settings.fields.removeByName("printer_open_drawer"); } catch (_) {}
    app.save(settings);
  }
);
