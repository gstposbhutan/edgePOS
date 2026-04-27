const PocketBase = require('pocketbase').default;

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = 'admin@pos.local';
const ADMIN_PASS = 'admin12345';

// Allow any authenticated POS user to read/write records
const AUTH_RULE = "@request.auth.id != ''";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function addField(pb, collectionName, fieldDef) {
  const col = await pb.collections.getOne(collectionName);
  if (col.fields.some((f) => f.name === fieldDef.name)) {
    console.log(`  ⏭ Field "${fieldDef.name}" already exists in ${collectionName}`);
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

// ── Main Setup ───────────────────────────────────────────────────────────────

async function setup() {
  const pb = new PocketBase(PB_URL);

  // Superuser auth (PocketBase 0.22+)
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
  console.log('🔑 Superuser authenticated');

  // ── users fields ───────────────────────────────────────────────────────────
  // name is not guaranteed by all PocketBase auth defaults, add if missing
  await addField(pb, 'users', { name: 'name', type: 'text', required: false });
  await addField(pb, 'users', {
    name: 'role',
    type: 'select',
    required: true,
    values: ['owner', 'manager', 'cashier'],
    options: { default: 'cashier' },
  });

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
    { name: 'current_stock', type: 'number', required: false, options: { default: 0 } },
    { name: 'reorder_point', type: 'number', required: false, options: { default: 10 } },
    { name: 'image', type: 'text', required: false },
    { name: 'is_active', type: 'bool', required: false, options: { default: true } },
    { name: 'category', type: 'relation', target: 'categories', required: false },
  ]);

  // ── customers ──────────────────────────────────────────────────────────────
  await addFields(pb, 'customers', [
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text', required: false },
    { name: 'credit_limit', type: 'number', required: false, options: { default: 0 } },
    { name: 'credit_balance', type: 'number', required: false, options: { default: 0 } },
  ]);

  // ── carts ──────────────────────────────────────────────────────────────────
  await addFields(pb, 'carts', [
    { name: 'status', type: 'text', required: true },
    { name: 'customer', type: 'relation', target: 'customers', required: false },
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
    { name: 'gst_amount', type: 'number', required: false, options: { default: 0 } },
    { name: 'total', type: 'number', required: false, options: { default: 0 } },
  ]);

  // ── orders ─────────────────────────────────────────────────────────────────
  await addFields(pb, 'orders', [
    { name: 'order_no', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'items', type: 'json', required: false },
    { name: 'subtotal', type: 'number', required: false, options: { default: 0 } },
    { name: 'gst_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'grand_total', type: 'number', required: false, options: { default: 0 } },
    { name: 'payment_method', type: 'text', required: false },
    { name: 'payment_ref', type: 'text', required: false },
    { name: 'customer', type: 'relation', target: 'customers', required: false },
    { name: 'customer_name', type: 'text', required: false },
    { name: 'customer_phone', type: 'text', required: false },
    { name: 'cashier', type: 'relation', target: 'users', required: false },
    { name: 'digital_signature', type: 'text', required: false },
    { name: 'cancellation_reason', type: 'text', required: false },
    { name: 'refund_amount', type: 'number', required: false, options: { default: 0 } },
    { name: 'refund_reason', type: 'text', required: false },
  ]);

  // ── inventory_movements ────────────────────────────────────────────────────
  await addFields(pb, 'inventory_movements', [
    { name: 'product', type: 'relation', target: 'products', required: true },
    { name: 'type', type: 'text', required: true },
    { name: 'quantity', type: 'number', required: true },
    { name: 'order', type: 'relation', target: 'orders', required: false },
    { name: 'notes', type: 'text', required: false },
  ]);

  // ── khata_transactions ─────────────────────────────────────────────────────
  await addFields(pb, 'khata_transactions', [
    { name: 'customer', type: 'relation', target: 'customers', required: true },
    { name: 'type', type: 'text', required: true },
    { name: 'amount', type: 'number', required: true, options: { default: 0 } },
    { name: 'order', type: 'relation', target: 'orders', required: false },
    { name: 'notes', type: 'text', required: false },
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
  ]);

  // ── shifts ─────────────────────────────────────────────────────────────────
  await addFields(pb, 'shifts', [
    { name: 'opened_by', type: 'relation', target: 'users', required: true },
    { name: 'closed_by', type: 'relation', target: 'users', required: false },
    { name: 'opening_float', type: 'number', required: true, options: { default: 0 } },
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

  // ── Set access rules on all collections ──────────────────────────────────
  const collectionNames = [
    'categories', 'products', 'customers', 'carts', 'cart_items',
    'orders', 'inventory_movements', 'khata_transactions', 'settings', 'shifts'
  ];
  console.log('\n🔒 Access rules:');
  for (const name of collectionNames) {
    try {
      const col = await pb.collections.getOne(name);
      // Only update if rules are not already set
      if (col.listRule !== AUTH_RULE || col.createRule !== AUTH_RULE) {
        col.listRule = AUTH_RULE;
        col.viewRule = AUTH_RULE;
        col.createRule = AUTH_RULE;
        col.updateRule = AUTH_RULE;
        col.deleteRule = AUTH_RULE;
        await pb.collections.update(col.id, col);
        console.log(`  ✓ Set rules on ${name}`);
      } else {
        console.log(`  ⏭ Rules already set on ${name}`);
      }
    } catch (e) {
      console.error(`  ✗ Failed to set rules on ${name}:`, e.message);
    }
  }

  // ── Seed default user ────────────────────────────────────────────────────
  try {
    await pb.collection('users').create({
      email: 'admin@pos.local',
      password: 'admin12345',
      passwordConfirm: 'admin12345',
      name: 'Admin',
      role: 'owner',
      verified: true,
    });
    console.log('\n👤 Created default user admin@pos.local');
  } catch (e) {
    if (e.message?.includes('already exists') || e.data?.email?.code === 'validation_not_unique') {
      console.log('\n👤 Default user already exists');
    } else {
      console.error('\n❌ Error creating user:', e.message);
    }
  }

  console.log('\n✅ Setup complete!');
  console.log('Login with: admin@pos.local / admin12345');
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
