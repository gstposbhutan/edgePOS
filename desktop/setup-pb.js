const PocketBase = require('pocketbase').default;

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
// Superuser (PocketBase admin) used to run this setup. Sourced from env; the
// weak defaults exist only for first-run local dev and MUST be overridden and
// rotated in any real deployment (PB_ADMIN_EMAIL / PB_ADMIN_PASS).
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@pos.local';
const ADMIN_PASS = process.env.PB_ADMIN_PASS || 'admin12345';
// Seed POS application user (role: owner). Override via SEED_USER_EMAIL / SEED_USER_PASS.
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL || 'admin@pos.local';
const SEED_USER_PASS = process.env.SEED_USER_PASS || 'admin12345';
const USING_DEFAULT_SECRETS = !process.env.PB_ADMIN_PASS || !process.env.SEED_USER_PASS;

const AUTH_RULE = "@request.auth.id != ''";
// Role-scoped rules. The `users` auth collection has a `role` select
// (owner | manager | cashier), so rules can reference @request.auth.role.
const MANAGER_RULE = "@request.auth.id != '' && (@request.auth.role = 'owner' || @request.auth.role = 'manager')";
const OWNER_RULE = "@request.auth.id != '' && @request.auth.role = 'owner'";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function addField(pb, collectionName, fieldDef) {
  const col = await pb.collections.getOne(collectionName);
  const existing = col.fields.find((f) => f.name === fieldDef.name);
  if (existing) {
    // Update existing field properties (required, options, etc.)
    let changed = false;
    if (fieldDef.required !== undefined && existing.required !== fieldDef.required) {
      existing.required = fieldDef.required;
      changed = true;
    }
    if (fieldDef.options && Object.keys(fieldDef.options).some(k => existing.options?.[k] !== fieldDef.options[k])) {
      existing.options = { ...existing.options, ...fieldDef.options };
      changed = true;
    }
    if (changed) {
      await pb.collections.update(col.id, col);
      console.log(`  ✓ Updated "${fieldDef.name}" in ${collectionName}`);
    } else {
      console.log(`  ⏭ Field "${fieldDef.name}" already exists in ${collectionName}`);
    }
    return;
  }
  col.fields.push(fieldDef);
  await pb.collections.update(col.id, col);
  console.log(`  ✓ Added "${fieldDef.name}" (${fieldDef.type}) to ${collectionName}`);
}

async function addRelationField(pb, collectionName, targetCollectionName, fieldName, required) {
  const col = await pb.collections.getOne(collectionName);
  if (col.fields.some((f) => f.name === fieldName)) {
    console.log(`  ⏭ Relation "${fieldName}" already exists in ${collectionName}`);
    return;
  }
  const targetCol = await pb.collections.getOne(targetCollectionName);
  col.fields.push({
    name: fieldName,
    type: 'relation',
    required: !!required,
    collectionId: targetCol.id,
    cascadeDelete: false,
    maxSelect: 1,
    minSelect: 0,
  });
  await pb.collections.update(col.id, col);
  console.log(`  ✓ Added relation "${fieldName}" → ${targetCollectionName} to ${collectionName}`);
}

async function addFields(pb, collectionName, fields) {
  console.log(`\n📦 ${collectionName}:`);
  for (const f of fields) {
    if (f.type === 'relation') {
      await addRelationField(pb, collectionName, f.target, f.name, f.required);
    } else {
      await addField(pb, collectionName, f);
    }
  }
}

async function ensureCollection(pb, name, def) {
  try {
    await pb.collections.getOne(name);
    console.log(`  ⏭ Collection "${name}" already exists`);
  } catch {
    await pb.collections.create({ name, type: 'base', ...def });
    console.log(`  ✓ Created collection "${name}"`);
  }
}

// ── Main Setup ───────────────────────────────────────────────────────────────

async function setup() {
  const pb = new PocketBase(PB_URL);

  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
  console.log('🔑 Superuser authenticated');

  if (USING_DEFAULT_SECRETS) {
    console.warn(
      '\n⚠️  Using DEFAULT credentials. Set PB_ADMIN_EMAIL/PB_ADMIN_PASS and ' +
      'SEED_USER_EMAIL/SEED_USER_PASS, and rotate them, before any real deployment.'
    );
  }

  // ── users ──────────────────────────────────────────────────────────────────
  await addField(pb, 'users', { name: 'name', type: 'text', required: false });
  await addField(pb, 'users', {
    name: 'role', type: 'select', required: true,
    values: ['owner', 'manager', 'cashier'],
    options: { default: 'cashier' },
  });

  // ── entities ───────────────────────────────────────────────────────────────
  await addFields(pb, 'entities', [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', required: false },
    { name: 'tpn_gstin', type: 'text', required: false },
    { name: 'whatsapp_no', type: 'text', required: false },
    { name: 'shop_slug', type: 'text', required: false },
    { name: 'is_active', type: 'bool', required: false, options: { default: true } },
  ]);

  // ── categories ─────────────────────────────────────────────────────────────
  await addFields(pb, 'categories', [
    { name: 'name', type: 'text', required: true },
    { name: 'color', type: 'text', required: false },
  ]);

  // ── products ───────────────────────────────────────────────────────────────
  await addFields(pb, 'products', [
    { name: 'name', type: 'text', required: true },
    { name: 'sku', type: 'text', required: false },
    { name: 'barcode', type: 'text', required: false },
    { name: 'qr_code', type: 'text', required: false },
    { name: 'hsn_code', type: 'text', required: false },
    { name: 'unit', type: 'text', required: false },
    { name: 'mrp', type: 'number', required: false, options: { default: 0 } },
    { name: 'cost_price', type: 'number', required: false, options: { default: 0 } },
    { name: 'sale_price', type: 'number', required: false, options: { default: 0 } },
    { name: 'wholesale_price', type: 'number', required: false, options: { default: 0 } },
    { name: 'current_stock', type: 'number', required: false, options: { default: 0 } },
    { name: 'reorder_point', type: 'number', required: false, options: { default: 10 } },
    { name: 'image_url', type: 'text', required: false },
    { name: 'image_embedding', type: 'text', required: false },
    { name: 'is_active', type: 'bool', required: false, options: { default: true } },
    { name: 'sold_by_weight', type: 'bool', required: false, options: { default: false } },
    { name: 'gst_exempt', type: 'bool', required: false, options: { default: false } },
    { name: 'category', type: 'relation', target: 'categories', required: false },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // ── khata_accounts ─────────────────────────────────────────────────────────
  await addFields(pb, 'khata_accounts', [
    { name: 'debtor_name', type: 'text', required: true },
    { name: 'debtor_phone', type: 'text', required: false },
    { name: 'credit_limit', type: 'number', required: false, options: { default: 0 } },
    { name: 'outstanding_balance', type: 'number', required: false, options: { default: 0 } },
    { name: 'creditor_entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'party_type', type: 'text', required: false },
    { name: 'debtor_entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'debtor_face_id_hash', type: 'text', required: false },
    { name: 'credit_term_days', type: 'number', required: false, options: { default: 30 } },
    { name: 'status', type: 'text', required: false },
    { name: 'last_payment_at', type: 'date', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // ── carts ──────────────────────────────────────────────────────────────────
  await addFields(pb, 'carts', [
    { name: 'status', type: 'text', required: true },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'customer_whatsapp', type: 'text', required: false },
    { name: 'buyer_hash', type: 'text', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // ── cart_items ─────────────────────────────────────────────────────────────
  await addFields(pb, 'cart_items', [
    { name: 'cart', type: 'relation', target: 'carts', required: true },
    { name: 'product', type: 'relation', target: 'products', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'sku', type: 'text', required: false },
    { name: 'quantity', type: 'number', required: true, options: { default: 1 } },
    { name: 'unit_price', type: 'number', required: true, options: { default: 0 } },
    { name: 'discount', type: 'number', required: false, options: { default: 0 } },
    { name: 'gst_5', type: 'number', required: false, options: { default: 0 } },
    { name: 'gst_exempt', type: 'bool', required: false, options: { default: false } },
    { name: 'total', type: 'number', required: false, options: { default: 0 } },
  ]);

  // ── orders ─────────────────────────────────────────────────────────────────
  await addFields(pb, 'orders', [
    { name: 'order_type', type: 'text', required: false },
    { name: 'order_no', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'items', type: 'json', required: false },
    { name: 'subtotal', type: 'number', required: false, options: { default: 0 } },
    { name: 'gst_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'grand_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'payment_method', type: 'text', required: false },
    { name: 'payment_channel', type: 'text', required: false },
    { name: 'payment_ref', type: 'text', required: false },
    { name: 'seller_id', type: 'relation', target: 'entities', required: false },
    { name: 'buyer_id', type: 'relation', target: 'entities', required: false },
    { name: 'buyer_whatsapp', type: 'text', required: false },
    { name: 'buyer_hash', type: 'text', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
    { name: 'customer_name', type: 'text', required: false },
    { name: 'customer_phone', type: 'text', required: false },
    { name: 'digital_signature', type: 'text', required: false },
    { name: 'payment_verified_at', type: 'date', required: false },
    { name: 'ocr_verify_id', type: 'text', required: false },
    { name: 'retry_count', type: 'number', required: false, options: { default: 0 } },
    { name: 'max_retries', type: 'number', required: false, options: { default: 3 } },
    { name: 'whatsapp_status', type: 'text', required: false },
    { name: 'cancellation_reason', type: 'text', required: false },
    { name: 'refund_amount', type: 'number', required: false, options: { default: 0 } },
    { name: 'refund_reason', type: 'text', required: false },
    { name: 'completed_at', type: 'date', required: false },
    { name: 'cancelled_at', type: 'date', required: false },
    { name: 'cart_id', type: 'relation', target: 'carts', required: false },
  ]);

  // ── inventory_movements ────────────────────────────────────────────────────
  await addFields(pb, 'inventory_movements', [
    { name: 'product', type: 'relation', target: 'products', required: true },
    { name: 'movement_type', type: 'text', required: true },
    { name: 'quantity', type: 'number', required: true },
    { name: 'reference_id', type: 'relation', target: 'orders', required: false },
    { name: 'notes', type: 'text', required: false },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // ── khata_transactions ─────────────────────────────────────────────────────
  await addFields(pb, 'khata_transactions', [
    { name: 'khata_account', type: 'relation', target: 'khata_accounts', required: true },
    { name: 'transaction_type', type: 'text', required: true },
    { name: 'amount', type: 'number', required: true, options: { default: 0 } },
    { name: 'balance_after', type: 'number', required: false, options: { default: 0 } },
    { name: 'reference_id', type: 'relation', target: 'orders', required: false },
    { name: 'payment_method', type: 'text', required: false },
    { name: 'notes', type: 'text', required: false },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // ── settings ───────────────────────────────────────────────────────────────
  await addFields(pb, 'settings', [
    { name: 'store_name', type: 'text', required: true },
    { name: 'store_address', type: 'text', required: false },
    { name: 'tpn_gstin', type: 'text', required: false },
    { name: 'phone', type: 'text', required: false },
    { name: 'receipt_header', type: 'text', required: false },
    { name: 'receipt_footer', type: 'text', required: false },
    { name: 'gst_rate', type: 'number', required: false, options: { default: 5 } },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'store_entity_id', type: 'text', required: false },
    { name: 'nqrc_enabled', type: 'bool', required: false, options: { default: false } },
    { name: 'nqrc_merchant_name', type: 'text', required: false },
    { name: 'nqrc_merchant_city', type: 'text', required: false },
    { name: 'nqrc_account_id', type: 'text', required: false },
    { name: 'nqrc_psp_guid', type: 'text', required: false },
    { name: 'nqrc_mcc', type: 'text', required: false },
    { name: 'nqrc_account_tag', type: 'text', required: false },
  ]);

  // ── shifts ─────────────────────────────────────────────────────────────────
  await addFields(pb, 'shifts', [
    { name: 'opened_by', type: 'relation', target: 'users', required: true },
    { name: 'closed_by', type: 'relation', target: 'users', required: false },
    { name: 'opening_float', type: 'number', required: false, options: { default: 0 } },
    { name: 'closing_count', type: 'number', required: false, options: { default: 0 } },
    { name: 'expected_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'discrepancy', type: 'number', required: false, options: { default: 0 } },
    { name: 'status', type: 'text', required: true },
    { name: 'opened_at', type: 'date', required: false },
    { name: 'closed_at', type: 'date', required: false },
    { name: 'cash_sales', type: 'number', required: false, options: { default: 0 } },
    { name: 'digital_sales', type: 'number', required: false, options: { default: 0 } },
    { name: 'credit_sales', type: 'number', required: false, options: { default: 0 } },
    { name: 'refund_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'transaction_count', type: 'number', required: false, options: { default: 0 } },
  ]);

  // ── cash_adjustments ───────────────────────────────────────────────────────
  await addFields(pb, 'cash_adjustments', [
    { name: 'amount', type: 'number', required: true, options: { default: 0 } },
    { name: 'type', type: 'text', required: true },
    { name: 'reason', type: 'text', required: true },
    { name: 'notes', type: 'text', required: false },
    { name: 'shift', type: 'relation', target: 'shifts', required: true },
    { name: 'created_by', type: 'relation', target: 'users', required: true },
  ]);

  // ── cash_registers (registers = terminals; one per machine, keyed by MAC) ─────
  await ensureCollection(pb, 'cash_registers', {
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: MANAGER_RULE,
    deleteRule: MANAGER_RULE,
    fields: [
      { name: 'machine_id', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'default_opening_float', type: 'number', required: false, options: { default: 0 } },
      { name: 'is_active', type: 'bool', required: false, options: { default: true } },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_cash_registers_machine` ON `cash_registers` (`machine_id`)'],
  });
  await addFields(pb, 'cash_registers', [
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  // register_id (which terminal) on the transactional collections
  await addFields(pb, 'orders', [{ name: 'register_id', type: 'relation', target: 'cash_registers', required: false }]);
  await addFields(pb, 'shifts', [{ name: 'register_id', type: 'relation', target: 'cash_registers', required: false }]);
  await addFields(pb, 'inventory_movements', [{ name: 'register_id', type: 'relation', target: 'cash_registers', required: false }]);
  await addFields(pb, 'cash_adjustments', [{ name: 'register_id', type: 'relation', target: 'cash_registers', required: false }]);

  // is_synced: marks which rows the terminal has pushed to the cloud ingest.
  // (orders.is_synced already comes from migration 001.)
  await addFields(pb, 'inventory_movements', [{ name: 'is_synced', type: 'bool', required: false, options: { default: false } }]);
  await addFields(pb, 'khata_transactions', [{ name: 'is_synced', type: 'bool', required: false, options: { default: false } }]);

  // ── Audit trail (P2-2): order_status_log + audit_logs, mirroring the web app.
  //    Append-only over the API (no create/update/delete rules) — only the audit
  //    hook (pb_hooks/audit.pb.js) writes them, via a rule-bypassing direct save.
  //    (The 005 migration also creates these; ensureCollection is a no-op if present.)
  await ensureCollection(pb, 'order_status_log', {
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'from_status', type: 'text', required: false },
      { name: 'to_status', type: 'text', required: true },
      { name: 'reason', type: 'text', required: false },
      { name: 'metadata', type: 'json', required: false },
      { name: 'actor_role', type: 'text', required: false },
    ],
    indexes: ['CREATE INDEX `idx_order_status_log_order` ON `order_status_log` (`order`)'],
  });
  await addFields(pb, 'order_status_log', [
    { name: 'order', type: 'relation', target: 'orders', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  await ensureCollection(pb, 'audit_logs', {
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'table_name', type: 'text', required: true },
      { name: 'record_id', type: 'text', required: false },
      { name: 'operation', type: 'select', required: true, values: ['INSERT', 'UPDATE', 'DELETE'] },
      { name: 'old_values', type: 'json', required: false },
      { name: 'new_values', type: 'json', required: false },
      { name: 'actor_id', type: 'text', required: false },
      { name: 'actor_role', type: 'text', required: false },
    ],
  });

  // ── Purchasing: wholesaler connections + purchase orders (retailer restock) ──
  await ensureCollection(pb, 'wholesaler_connections', { listRule: AUTH_RULE, viewRule: AUTH_RULE });
  await addFields(pb, 'wholesaler_connections', [
    { name: 'wholesaler', type: 'relation', target: 'entities', required: false },
    { name: 'wholesaler_name', type: 'text', required: true },
    { name: 'wholesaler_phone', type: 'text', required: false },
    { name: 'tpn_gstin', type: 'text', required: false },
    { name: 'status', type: 'text', required: false },
    { name: 'notes', type: 'text', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
  ]);

  await ensureCollection(pb, 'purchase_orders', { listRule: AUTH_RULE, viewRule: AUTH_RULE });
  await addFields(pb, 'purchase_orders', [
    { name: 'po_no', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'supplier', type: 'relation', target: 'entities', required: false },
    { name: 'supplier_name', type: 'text', required: false },
    { name: 'items', type: 'json', required: false },
    { name: 'subtotal', type: 'number', required: false, options: { default: 0 } },
    { name: 'gst_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'grand_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'notes', type: 'text', required: false },
    { name: 'expected_at', type: 'date', required: false },
    { name: 'submitted_at', type: 'date', required: false },
    { name: 'confirmed_at', type: 'date', required: false },
    { name: 'received_at', type: 'date', required: false },
    { name: 'entity_id', type: 'relation', target: 'entities', required: false },
    { name: 'created_by', type: 'relation', target: 'users', required: false },
    { name: 'is_synced', type: 'bool', required: false, options: { default: false } },
  ]);

  // ── Canonical payment_method values (P1-1) ───────────────────────────────────
  // The 001 migration defined orders.payment_method as a lowercase select
  // (cash/mbob/mpay/rtgs/credit). Re-point it to the canonical web enum so synced
  // orders pass Supabase's CHECK. mBoB/mPay/RTGS now ride ONLINE + payment_channel.
  try {
    const orders = await pb.collections.getOne('orders');
    const pm = orders.fields.find((f) => f.name === 'payment_method');
    if (pm && pm.type === 'select') {
      pm.values = ['CASH', 'CREDIT', 'ONLINE'];
      pm.maxSelect = 1;
      await pb.collections.update(orders.id, orders);
      console.log('\n💳 orders.payment_method values canonicalized → CASH/CREDIT/ONLINE');
    } else {
      console.log('\n💳 orders.payment_method is not a select — skipped');
    }
  } catch (e) {
    console.error('\n✗ Failed to canonicalize payment_method:', e.message);
  }

  // ── Access rules (role-scoped) ───────────────────────────────────────────────
  // Reads stay open to any authenticated user — the POS terminal must read
  // products/customers/orders/etc. to operate. Writes are scoped by role:
  //   • Cashiers run sales: create orders/movements/khata + update stock/balance.
  //   • Ledgers (inventory_movements, khata_transactions, cash_adjustments) are
  //     append-only for cashiers (create allowed; update/delete = manager+).
  //   • Deletes, product/category management, and store settings/entities are
  //     restricted to managers/owners.
  //   • settings.create stays open so first-run auto-create (use-settings.ts)
  //     works for any user; settings.update/delete = owner only (this is what
  //     protects tpn_gstin / store name from cashier edits).
  // KNOWN GAP: field-level protection (e.g. only a manager may change a khata
  // account's credit_limit, which cashiers must still update for balances)
  // needs a PocketBase hook — tracked as a follow-up in the parity-fix plan.
  const RULES = {
    entities:            { list: AUTH_RULE, view: AUTH_RULE, create: OWNER_RULE,   update: OWNER_RULE,   delete: OWNER_RULE },
    settings:            { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: OWNER_RULE,   delete: OWNER_RULE },
    categories:          { list: AUTH_RULE, view: AUTH_RULE, create: MANAGER_RULE, update: MANAGER_RULE, delete: MANAGER_RULE },
    products:            { list: AUTH_RULE, view: AUTH_RULE, create: MANAGER_RULE, update: AUTH_RULE,    delete: MANAGER_RULE },
    khata_accounts:      { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: AUTH_RULE,    delete: MANAGER_RULE },
    khata_transactions:  { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: MANAGER_RULE, delete: MANAGER_RULE },
    cash_registers:      { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: MANAGER_RULE, delete: MANAGER_RULE },
    carts:               { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: AUTH_RULE,    delete: AUTH_RULE },
    cart_items:          { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: AUTH_RULE,    delete: AUTH_RULE },
    orders:              { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: AUTH_RULE,    delete: MANAGER_RULE },
    inventory_movements: { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: MANAGER_RULE, delete: MANAGER_RULE },
    shifts:              { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: AUTH_RULE,    delete: MANAGER_RULE },
    cash_adjustments:    { list: AUTH_RULE, view: AUTH_RULE, create: AUTH_RULE,    update: MANAGER_RULE, delete: MANAGER_RULE },
    wholesaler_connections: { list: AUTH_RULE, view: AUTH_RULE, create: MANAGER_RULE, update: MANAGER_RULE, delete: MANAGER_RULE },
    purchase_orders:        { list: AUTH_RULE, view: AUTH_RULE, create: MANAGER_RULE, update: MANAGER_RULE, delete: MANAGER_RULE },
  };
  console.log('\n🔒 Access rules:');
  for (const [name, rules] of Object.entries(RULES)) {
    try {
      const col = await pb.collections.getOne(name);
      col.listRule = rules.list;
      col.viewRule = rules.view;
      col.createRule = rules.create;
      col.updateRule = rules.update;
      col.deleteRule = rules.delete;
      await pb.collections.update(col.id, col);
      console.log(`  ✓ Set role-scoped rules on ${name}`);
    } catch (e) {
      console.error(`  ✗ Failed to set rules on ${name}:`, e.message);
    }
  }

  // ── Batch API (required for atomic checkout — see hooks/use-checkout.ts P0-5) ──
  try {
    await pb.settings.update({ batch: { enabled: true, maxRequests: 100, timeout: 15 } });
    console.log('\n⚙️  Batch API enabled (atomic multi-record writes)');
  } catch (e) {
    console.error('\n⚠️  Could not enable Batch API:', e.message);
  }

  // ── Seed owner user ──────────────────────────────────────────────────────
  try {
    await pb.collection('users').create({
      email: SEED_USER_EMAIL,
      password: SEED_USER_PASS,
      passwordConfirm: SEED_USER_PASS,
      name: 'Owner',
      role: 'owner',
      verified: true,
    });
    console.log(`\n👤 Created owner user ${SEED_USER_EMAIL}`);
  } catch (e) {
    if (e.message?.includes('already exists') || e.data?.email?.code === 'validation_not_unique') {
      console.log(`\n👤 Owner user already exists (${SEED_USER_EMAIL})`);
    } else {
      console.error('\n❌ Error creating user:', e.message);
    }
  }

  console.log('\n✅ Setup complete!');
  console.log(`Login with: ${SEED_USER_EMAIL}`);
  if (USING_DEFAULT_SECRETS) {
    console.warn('⚠️  Default password in use — change it now and set SEED_USER_PASS for future setups.');
  }
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
