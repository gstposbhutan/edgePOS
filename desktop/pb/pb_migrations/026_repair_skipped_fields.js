/// <reference path="../pb_data/types.d.ts" />

// Repairs fields that earlier migrations believed they had added but never did.
//
// Every migration from 007 onward guarded with some form of
//     try { c.fields.getByName(name); exists = true } catch (_) { exists = false }
// on the assumption that getByName THROWS for a missing field. It does not — it returns
// undefined. So the guard reported "already present" for every field and the add was skipped,
// while PocketBase recorded the migration as applied. PocketBase then silently drops unknown
// fields on write, so the values went nowhere and nothing ever errored.
//
// Fourteen fields were affected, including bill discounts, salesperson attribution, GST-exempt
// flags and the printer/payment-QR settings — all silently discarded on every terminal.
//
// The originals have been corrected for fresh installs; this migration exists for terminals
// where those migrations are already recorded as applied and so will never run again.
// Idempotent, and skips anything already present.
migrate(
  (app) => {
    const has = (c, name) => {
      try { return !!c.fields.getByName(name); } catch (_) { return false; }
    };
    const add = (collection, name, field) => {
      const c = app.findCollectionByNameOrId(collection);
      if (has(c, name)) return;
      c.fields.add(field);
      app.save(c);
    };

    // 007 / 014 / 016 / 009 — the order record
    add("orders", "invoice_date", new DateField({ name: "invoice_date" }));
    add("orders", "bill_discount", new NumberField({ name: "bill_discount" }));
    add("orders", "is_quotation", new BoolField({ name: "is_quotation" }));
    add("orders", "delivery_address", new TextField({ name: "delivery_address" }));
    add("orders", "complimentary_reason", new TextField({ name: "complimentary_reason" }));
    // 009 made this a relation to the users collection; resolve its id the same way.
    {
      const c = app.findCollectionByNameOrId("orders");
      if (!has(c, "salesperson_id")) {
        const users = app.findCollectionByNameOrId("_pb_users_auth_");
        c.fields.add(new RelationField({
          name: "salesperson_id", required: false, collectionId: users.id, maxSelect: 1,
        }));
        app.save(c);
      }
    }

    // 014 — the open ticket carries the same discount
    add("carts", "bill_discount", new NumberField({ name: "bill_discount" }));

    // 015 / 022 — the cart line
    add("cart_items", "salesperson_id", new TextField({ name: "salesperson_id" }));
    add("cart_items", "gst_exempt", new BoolField({ name: "gst_exempt" }));

    // 008 / 022 / 009 — the catalog
    add("products", "distributor_price", new NumberField({ name: "distributor_price" }));
    add("products", "gst_exempt", new BoolField({ name: "gst_exempt" }));
    add("products", "visible_on_web", new BoolField({ name: "visible_on_web" }));

    // 012 — thermal printer configuration
    add("settings", "printer_device_name", new TextField({ name: "printer_device_name" }));
    add("settings", "printer_paper_width", new NumberField({ name: "printer_paper_width", onlyInt: true }));
    add("settings", "printer_auto_print", new BoolField({ name: "printer_auto_print" }));
    add("settings", "printer_copies", new NumberField({ name: "printer_copies", onlyInt: true }));

    // 023 — Bhutan NQRC payment QR
    add("settings", "nqrc_enabled", new BoolField({ name: "nqrc_enabled" }));
    add("settings", "nqrc_merchant_name", new TextField({ name: "nqrc_merchant_name" }));
    add("settings", "nqrc_merchant_city", new TextField({ name: "nqrc_merchant_city" }));
    add("settings", "nqrc_account_id", new TextField({ name: "nqrc_account_id" }));
    add("settings", "nqrc_psp_guid", new TextField({ name: "nqrc_psp_guid" }));
    add("settings", "nqrc_mcc", new TextField({ name: "nqrc_mcc" }));
    add("settings", "nqrc_account_tag", new TextField({ name: "nqrc_account_tag" }));
  },
  // No down: these fields were always meant to exist, and dropping them would destroy data the
  // terminal has since written into them.
  (_app) => {}
);
