const { createClient } = require('@supabase/supabase-js')
const {
  TEST_ENTITY,
  TEST_PRODUCTS,
  TEST_USERS,
  TEST_ORDERS,
  TEST_KHATA_ACCOUNTS,
} = require('./test-data')

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

  // ── 3. Upsert orders (keep items JSONB, use schema field names) ──
  const orders = TEST_ORDERS.map((order) => order)

  const { error: ordersErr } = await supabase
    .from('orders')
    .upsert(orders, { onConflict: 'id' })

  if (ordersErr) {
    console.error('[DB Seed] Orders upsert failed:', ordersErr.message)
    throw ordersErr
  }

  // ── 4. Upsert order items (map test data to schema columns) ─────
  const orderItems = TEST_ORDERS.flatMap((order, oIdx) =>
    order.items.map((item, idx) => {
      const seq = oIdx * 10 + idx + 1
      const suffix = String(seq).padStart(4, '0')
      return {
        id: `00000000-0000-4000-8000-00000005${suffix}`,
        order_id: order.id,
        product_id: item.product_id,
        sku: item.sku,
        name: item.name,
        quantity: item.qty,
        unit_price: item.rate,
        discount: item.discount || 0,
        gst_5: item.gst_5,
        total: item.total,
        status: 'ACTIVE',
      }
    })
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

  // ── 6. Create/update auth users and build ID map ───────────────
  const authIdMap = {} // email → actual auth user ID

  for (const user of TEST_USERS) {
    // Check if user already exists
    const { data: { users: existing } } = await supabase.auth.admin.listUsers()
    const found = existing.find(u => u.email === user.email)

    if (found) {
      authIdMap[user.email] = found.id
      // Update app_metadata to keep claims in sync
      await supabase.auth.admin.updateUserById(found.id, {
        app_metadata: {
          role: user.role,
          sub_role: user.sub_role,
          entity_id: user.entity_id,
          permissions: user.permissions,
        },
      })
    } else {
      const { data, error: authErr } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        app_metadata: {
          role: user.role,
          sub_role: user.sub_role,
          entity_id: user.entity_id,
          permissions: user.permissions,
        },
      })

      if (authErr) {
        console.error(`[DB Seed] Auth user creation failed for ${user.email}:`, authErr.message || authErr.code)
        throw authErr
      }
      authIdMap[user.email] = data.user.id
    }
  }

  // ── 7. Upsert user profiles using actual auth IDs ──────────────
  const profiles = TEST_USERS.map((user) => ({
    id: authIdMap[user.email],
    entity_id: user.entity_id,
    role: user.role,
    sub_role: user.sub_role,
    permissions: user.permissions,
    full_name: user.sub_role.charAt(0) + user.sub_role.slice(1).toLowerCase(),
  }))

  const { error: profileErr } = await supabase
    .from('user_profiles')
    .upsert(profiles, { onConflict: 'id' })

  if (profileErr) {
    console.error('[DB Seed] User profiles upsert failed:', profileErr.message)
    throw profileErr
  }

  console.log(
    `[DB Seed] Seeded: 1 entity, ${TEST_PRODUCTS.length} products, ${TEST_ORDERS.length} orders, ${TEST_KHATA_ACCOUNTS.length} khata accounts, ${TEST_USERS.length} users, ${profiles.length} profiles`
  )
  console.log('[DB Seed] Auth ID map:', JSON.stringify(authIdMap, null, 2))
}

module.exports = { seedDatabase }
