/// <reference path="../pb_data/types.d.ts" />

// Ctrl+T item remark — a free-text note on ONE ticket line (spec: Counter map, "^T Item
// remark"). Mirrors cloud migration 135.
//
// Distinct from the order-level notes: this rides with the line ("no chilli", "customer's own
// container", "damaged carton — sold as seen"), so it lives on cart_items and is copied into
// the order's items snapshot at checkout.
//
// Note the guard: getByName returns UNDEFINED for a missing field, it does not throw. Migrations
// 007-025 assumed it threw and so silently added nothing (see 026) — keep `has` as written.
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

    add("cart_items", "remark", new TextField({ name: "remark", max: 200 }));
  },
  // No down: dropping this would destroy notes the shop wrote against live tickets.
  (_app) => {}
);
