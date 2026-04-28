/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const superusers = app.findCollectionByNameOrId("_superusers");

    // Check if superuser already exists
    try {
      const existing = app.findAuthRecordByEmail("_superusers", "admin@pos.local");
      if (existing) return; // already seeded
    } catch {
      // not found — proceed to create
    }

    const admin = new Record(superusers);
    admin.set("email", "admin@pos.local");
    admin.set("password", "admin12345");
    app.save(admin);
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail("_superusers", "admin@pos.local");
      app.delete(record);
    } catch {
      // silent — may already be deleted
    }
  }
);
