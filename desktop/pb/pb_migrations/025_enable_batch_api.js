/// <reference path="../pb_data/types.d.ts" />

// Checkout writes the order, the stock decrements, the inventory movements and any khata debit
// in ONE PocketBase batch, so a mid-checkout failure can never leave a half-rung sale (see
// use-checkout). PocketBase ships with the Batch API DISABLED, and nothing turned it on — so on
// a terminal with default settings every sale fails with "Batch requests are not allowed."
//
// Enabling it belongs here rather than in a setup note: a migration reaches terminals that are
// already installed, and re-running is harmless.
migrate(
  (app) => {
    const settings = app.settings();
    if (settings.batch.enabled) return;
    settings.batch.enabled = true;
    // Checkout's batch is one order + one line-item set + per-item movements + an optional
    // khata pair, so a large ticket needs headroom above the default 50.
    if (settings.batch.maxRequests < 200) settings.batch.maxRequests = 200;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.batch.enabled = false;
    app.save(settings);
  }
);
