/// <reference path="../pb_data/types.d.ts" />

// settings.printer_* — thermal-receipt printer config for the desktop till.
// Backs the owner-only Settings "Thermal Printer" card and the silent
// webContents.print path in electron/printer.js:
//   printer_device_name — OS printer name to print to ("" = OS default)
//   printer_paper_width  — receipt width in mm (58 or 80)
//   printer_auto_print   — print silently when the receipt modal opens (opt-in)
//   printer_copies       — number of copies per print
// PocketBase's Number/Bool field schema (v0.37) carries no column default, so
// the sensible defaults (width 80, auto-print off, 1 copy) are applied in the
// app's default-create (hooks/use-settings.ts). Idempotent — safe to re-run.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    const has = (name) => {
      try { settings.fields.getByName(name); return true; } catch (_) { return false; }
    };

    if (!has("printer_device_name")) {
      settings.fields.add(new TextField({ name: "printer_device_name" }));
    }
    if (!has("printer_paper_width")) {
      settings.fields.add(new NumberField({ name: "printer_paper_width", onlyInt: true }));
    }
    if (!has("printer_auto_print")) {
      settings.fields.add(new BoolField({ name: "printer_auto_print" }));
    }
    if (!has("printer_copies")) {
      settings.fields.add(new NumberField({ name: "printer_copies", onlyInt: true }));
    }
    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    ["printer_device_name", "printer_paper_width", "printer_auto_print", "printer_copies"].forEach((n) => {
      try { settings.fields.removeByName(n); } catch (_) {}
    });
    app.save(settings);
  }
);
