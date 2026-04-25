const { createClient } = require('@supabase/supabase-js')
const {
  TEST_ENTITY,
  TEST_PRODUCTS,
  TEST_USERS,
  TEST_ORDERS,
  TEST_KHATA_ACCOUNTS,
} = require('./test-data')

/**
 * Create a Supabase admin client using the service role key.
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars.
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E seeding.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Seed the test database with deterministic fixture data.
 * Uses upsert so it is idempotent — safe to run multiple times.
 */
async function seedDatabase() {
  const supabase = getAdminClient()

  // ── 1. Upsert entity ───────────────────────────────────────────
  const { error: entityErr } = await supabase
    .from('entities')
    .upsert(TEST_ENTITY, { onConflict: 'id' })

  if (entityErr) {
    console.error('[DB Seed] Entity upsert failed:', entityErr.message)
    throw entityErr
  }

  // ── 2. Upsert products ─────────────────────────────────────────
  const { error: productsErr } = await supabase
    .from('products')
    .upsert(TEST_PRODUCTS, { onConflict: 'id' })

  if (productsErr) {
    console.error('[DB Seed] Products upsert failed:', productsErr.message)
    throw productsErr
  }

  // ── 3. Upsert orders ───────────────────────────────────────────
  const orders = TEST_ORDERS.map(({ items, ...order }) => order)

  const { error: ordersErr } = await supabase
    .from('orders')
    .upsert(orders, { onConflict: 'id' })

  if (ordersErr) {
    console.error('[DB Seed] Orders upsert failed:', ordersErr.message)
    throw ordersErr
  }

  // ── 4. Upsert order items ──────────────────────────────────────
  const orderItems = TEST_ORDERS.flatMap((order) =>
    order.items.map((item, idx) => ({
      id: `${order.id}-item-${idx}`,
      order_id: order.id,
      entity_id: order.entity_id,
      ...item,
    }))
  )

  const { error: itemsErr } = await supabase
    .from('order_items')
    .upsert(orderItems, { onConflict: 'id' })

  if (itemsErr) {
    console.error('[DB Seed] Order items upsert failed:', itemsErr.message)
    throw itemsErr
  }

  // ── 5. Upsert khata accounts ───────────────────────────────────
  const { error: khataErr } = await supabase
    .from('khata_accounts')
    .upsert(TEST_KHATA_ACCOUNTS, { onConflict: 'id' })

  if (khataErr) {
    console.error('[DB Seed] Khata accounts upsert failed:', khataErr.message)
    throw khataErr
  }

  // ── 6. Create auth users (via admin API) ───────────────────────
  for (const user of TEST_USERS) {
    const { data, error: authErr } = await supabase.auth.admin.createUser({
      uid: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        role: user.role,
        sub_role: user.sub_role,
        entity_id: user.entity_id,
        permissions: user.permissions,
      },
    })

    // Ignore "user already exists" errors for idempotency
    if (authErr && !authErr.message.includes('already registered')) {
      console.error(`[DB Seed] Auth user creation failed for ${user.email}:`, authErr.message)
      throw authErr
    }
  }

  console.log(
    `[DB Seed] Seeded: 1 entity, ${TEST_PRODUCTS.length} products, ${TEST_ORDERS.length} orders, ${TEST_KHATA_ACCOUNTS.length} khata accounts, ${TEST_USERS.length} users`
  )
}

module.exports = { seedDatabase }
