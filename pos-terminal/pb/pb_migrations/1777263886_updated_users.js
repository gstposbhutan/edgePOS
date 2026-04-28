/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // add field
  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "select1466534506",
    "maxSelect": 0,
    "name": "role",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "owner",
      "manager",
      "cashier"
    ]
  }))

  app.save(collection)

  // Seed default POS user (skip if already exists)
  try {
    const user = new Record(collection, {
      email: "admin@pos.local",
      password: "admin12345",
      passwordConfirm: "admin12345",
      name: "Admin",
      role: "owner",
      verified: true,
    });
    app.save(user);
  } catch (_) { /* user already exists */ }

  return collection
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // remove field
  collection.fields.removeById("select1466534506")

  return app.save(collection)
})
