const PocketBase = require('pocketbase').default;

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = 'admin@pos.local';
const ADMIN_PASS = 'admin12345';

const AUTH_RULE = "@request.auth.id != ''";

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

// ── Main Setup ───────────────────────────────────────────────────────────────

async function setup() {
  const pb = new PocketBase(PB_URL);

  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
  console.log('🔑 Superuser authenticated');

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

  // ── Access rules ───────────────────────────────────────────────────────────
  const collectionNames = [
    'entities', 'categories', 'products', 'khata_accounts', 'carts', 'cart_items',
    'orders', 'inventory_movements', 'khata_transactions', 'settings', 'shifts'
  ];
  console.log('\n🔒 Access rules:');
  for (const name of collectionNames) {
    try {
      const col = await pb.collections.getOne(name);
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
