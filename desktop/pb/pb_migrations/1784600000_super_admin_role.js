/// <reference path="../pb_data/types.d.ts" />
// Add the internal 'super_admin' role and grant it full access. Terminals
// provision from migrations (not setup-pb.js), so this must live here:
//   1) users.role select allows 'super_admin'
//   2) every owner/manager-scoped rule also accepts 'super_admin'
// Mirrors setup-pb.js (the dev/docker path). super_admin passes auth-only rules
// implicitly (it's a signed-in user), so only the role-gated rules change here.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.getByName("role");
  role.values = ["super_admin", "owner", "manager", "cashier"];
  app.save(users);

  const OWNER = "@request.auth.id != '' && (@request.auth.role = 'super_admin' || @request.auth.role = 'owner')";
  const MANAGER = "@request.auth.id != '' && (@request.auth.role = 'super_admin' || @request.auth.role = 'owner' || @request.auth.role = 'manager')";
  const rules = {
    entities:               { createRule: OWNER,   updateRule: OWNER,   deleteRule: OWNER },
    settings:               { updateRule: OWNER,   deleteRule: OWNER },
    categories:             { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
    products:               { createRule: MANAGER, deleteRule: MANAGER },
    khata_accounts:         { deleteRule: MANAGER },
    khata_transactions:     { updateRule: MANAGER, deleteRule: MANAGER },
    cash_registers:         { updateRule: MANAGER, deleteRule: MANAGER },
    orders:                 { deleteRule: MANAGER },
    inventory_movements:    { updateRule: MANAGER, deleteRule: MANAGER },
    shifts:                 { deleteRule: MANAGER },
    cash_adjustments:       { updateRule: MANAGER, deleteRule: MANAGER },
    wholesaler_connections: { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
    purchase_orders:        { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
  };
  for (const [name, r] of Object.entries(rules)) {
    let col;
    try { col = app.findCollectionByNameOrId(name); } catch (_) { col = null; }
    if (!col) continue;
    for (const [k, v] of Object.entries(r)) col[k] = v;
    app.save(col);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.getByName("role");
  role.values = ["owner", "manager", "cashier"];
  app.save(users);

  const OWNER = "@request.auth.id != '' && @request.auth.role = 'owner'";
  const MANAGER = "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')";
  const rules = {
    entities:               { createRule: OWNER,   updateRule: OWNER,   deleteRule: OWNER },
    settings:               { updateRule: OWNER,   deleteRule: OWNER },
    categories:             { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
    products:               { createRule: MANAGER, deleteRule: MANAGER },
    khata_accounts:         { deleteRule: MANAGER },
    khata_transactions:     { updateRule: MANAGER, deleteRule: MANAGER },
    cash_registers:         { updateRule: MANAGER, deleteRule: MANAGER },
    orders:                 { deleteRule: MANAGER },
    inventory_movements:    { updateRule: MANAGER, deleteRule: MANAGER },
    shifts:                 { deleteRule: MANAGER },
    cash_adjustments:       { updateRule: MANAGER, deleteRule: MANAGER },
    wholesaler_connections: { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
    purchase_orders:        { createRule: MANAGER, updateRule: MANAGER, deleteRule: MANAGER },
  };
  for (const [name, r] of Object.entries(rules)) {
    let col;
    try { col = app.findCollectionByNameOrId(name); } catch (_) { col = null; }
    if (!col) continue;
    for (const [k, v] of Object.entries(r)) col[k] = v;
    app.save(col);
  }
})
