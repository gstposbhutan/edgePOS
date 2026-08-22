/// <reference path="../pb_data/types.d.ts" />

// settings.nqrc_* — Bhutan NQRC payment-QR merchant config, synced down from the cloud entity by
// doBootstrap so the terminal can render the dynamic payment QR fully offline. Mirrors the web
// entities.nqrc_* columns (web migration 116). Owner-configured on the cloud; read-only here.
// Idempotent — safe to re-run.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    const has = (name) => {
      try { settings.fields.getByName(name); return true; } catch (_) { return false; }
    };

    if (!has("nqrc_enabled")) settings.fields.add(new BoolField({ name: "nqrc_enabled" }));
    if (!has("nqrc_merchant_name")) settings.fields.add(new TextField({ name: "nqrc_merchant_name" }));
    if (!has("nqrc_merchant_city")) settings.fields.add(new TextField({ name: "nqrc_merchant_city" }));
    if (!has("nqrc_account_id")) settings.fields.add(new TextField({ name: "nqrc_account_id" }));
    if (!has("nqrc_psp_guid")) settings.fields.add(new TextField({ name: "nqrc_psp_guid" }));
    if (!has("nqrc_mcc")) settings.fields.add(new TextField({ name: "nqrc_mcc" }));
    if (!has("nqrc_account_tag")) settings.fields.add(new TextField({ name: "nqrc_account_tag" }));
    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    ["nqrc_enabled", "nqrc_merchant_name", "nqrc_merchant_city", "nqrc_account_id", "nqrc_psp_guid", "nqrc_mcc", "nqrc_account_tag"].forEach((n) => {
      try { settings.fields.removeByName(n); } catch (_) {}
    });
    app.save(settings);
  }
);
