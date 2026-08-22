/// <reference path="../pb_data/types.d.ts" />

// Split tender: one GST bill settled by more than one means (spec WF-07 — "Cash + online +
// credit on one GST bill").
//
// `payments` holds the parts: [{ method, channel, ref, amount }]. It is the truth about how a
// bill was settled. `payment_method` stays a single canonical value (CASH | CREDIT | ONLINE)
// carrying the LARGEST part, because the cloud's orders.payment_method has a CHECK constraint on
// that enum and existing reports group by it — a "SPLIT" value would violate one and skew the
// other. A single-payment sale leaves `payments` empty and behaves exactly as before.
//
// Idempotent — safe to re-run.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("orders");
    // getByName returns undefined for a missing field rather than throwing, so the
    // `try { getByName(); exists = true }` idiom used by the older migrations here marks every
    // field as already present and silently adds nothing. Check the returned value.
    let exists = false;
    try { exists = !!c.fields.getByName("payments"); } catch (_) { exists = false; }
    if (!exists) {
      c.fields.add(new JSONField({ name: "payments", maxSize: 20000 }));
      app.save(c);
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId("orders");
    try {
      c.fields.removeById(c.fields.getByName("payments").id);
      app.save(c);
    } catch (_) { /* already gone */ }
  }
);
