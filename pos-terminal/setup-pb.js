const PocketBase = require('pocketbase').default;

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = 'admin@pos.local';
const ADMIN_PASS = 'admin12345';

// Allow any authenticated POS user to read/write records
const AUTH_RULE = "@request.auth.id != ''";

async function setup() {
  const pb = new PocketBase(PB_URL);

  // Superuser auth (PocketBase 0.22+)
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASS);
  console.log('Superuser authenticated');

  // ── Add role field to existing users collection ──────────────────────────
  const users = await pb.collections.getOne('users');
  const hasRole = users.fields.some((f) => f.name === 'role');
  if (!hasRole) {
    users.fields.push({
      name: 'role',
      type: 'select',
      required: true,
      values: ['owner', 'manager', 'cashier'],
      options: { default: 'cashier' },
    });
    await pb.collections.update(users.id, users);
    console.log('Added "role" field to users collection');
  } else {
    console.log('Users collection already has "role" field');
  }

  // ── Set access rules on all collections ──────────────────────────────────
  const collections = [
    'categories', 'products', 'customers', 'carts', 'cart_items',
    'orders', 'inventory_movements', 'khata_transactions', 'settings', 'shifts'
  ];
  for (const name of collections) {
    try {
      const col = await pb.collections.getOne(name);
      col.listRule = AUTH_RULE;
      col.viewRule = AUTH_RULE;
      col.createRule = AUTH_RULE;
      col.updateRule = AUTH_RULE;
      col.deleteRule = AUTH_RULE;
      await pb.collections.update(col.id, col);
      console.log(`Set rules on ${name}`);
    } catch (e) {
      console.error(`Failed to set rules on ${name}:`, e.message);
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
    console.log('Created default user admin@pos.local');
  } catch (e) {
    // Already exists or uniqueness error — both are fine on re-runs
    if (e.message?.includes('already exists') || e.data?.email?.code === 'validation_not_unique') {
      console.log('Default user already exists');
    } else {
      console.error('Error creating user:', e.message);
    }
  }

  console.log('\n✅ Setup complete!');
  console.log('Login with: admin@pos.local / admin12345');
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
