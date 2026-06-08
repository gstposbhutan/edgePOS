/// <reference path="../pb_data/types.d.ts" />

// Weighed-at-counter goods (loose rice / sugar / vegetables / fruit). When `sold_by_weight`
// is true, the product's `sale_price` is the per-unit (per-kg) rate and the cashier enters a
// weight at checkout — the cart line stores quantity = weight, unit_price = rate, so the
// existing fractional-quantity math gives total = weight × rate. See
// docs/label-maker-plan.md §1A.
migrate(
  (app) => {
    const products = app.findCollectionByNameOrId("products");
    products.fields.add(new BoolField({ name: "sold_by_weight" }));
    app.save(products);
  },
  (app) => {
    const products = app.findCollectionByNameOrId("products");
    products.fields.removeByName("sold_by_weight");
    app.save(products);
  }
);
