/// <reference path="../pb_data/types.d.ts" />

// Pcs / Pack / Case unit ladder — the counter's Alt+U unit sheet (spec WF-05, RanceLab Alt+U).
//
// Mirrors cloud migration 134. Stock is ALWAYS held and moved in pieces; only the ticket line
// is scaled, so nothing about the stock model changes here.
//
//   products.pack_size   pieces per pack   (0 = no pack level for this item)
//   products.case_size   PACKS per case    (pieces per case = pack_size * case_size)
//   cart_items.unit_*    which level this line was rung at, and its factor in pieces
//
// Note the guard: getByName returns UNDEFINED for a missing field, it does not throw. Every
// migration from 007-025 assumed it threw and so silently added nothing (see 026). `has` below
// is written the corrected way — do not "simplify" it back into a bare try/catch on the call.
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

    // The item master carries the factors, synced down by the cloud bootstrap.
    add("products", "pack_size",  new NumberField({ name: "pack_size",  onlyInt: true }));
    add("products", "case_size",  new NumberField({ name: "case_size",  onlyInt: true }));
    add("products", "pack_label", new TextField({   name: "pack_label" }));
    add("products", "case_label", new TextField({   name: "case_label" }));

    // The open ticket line records the unit it was rung at. unit_factor is what checkout
    // multiplies by to move stock in pieces — a line missing it is read as 1 (pieces), which is
    // exactly how every line written before this migration should be read.
    add("cart_items", "unit_label",  new TextField({   name: "unit_label" }));
    add("cart_items", "unit_factor", new NumberField({ name: "unit_factor", onlyInt: true }));
  },
  // No down: dropping these would destroy the unit a past ticket was rung at, and the fields are
  // additive — an older build simply ignores them.
  (_app) => {}
);
