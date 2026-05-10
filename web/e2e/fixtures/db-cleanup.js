const { createClient } = require('@supabase/supabase-js')
const {
  TEST_ENTITY,
  TEST_PRODUCTS,
  TEST_ORDERS,
  TEST_KHATA_ACCOUNTS,
  TEST_USERS,
} = require('./test-data')

/**
 * Create a Supabase admin client using the service role key.
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E cleanup.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Remove all seeded test data in reverse dependency order.
 */
async function cleanupDatabase() {
  const supabase = getAdminClient()

  const orderIds = TEST_ORDERS.map((o) => o.id)
  const productIds = TEST_PRODUCTS.map((p) => p.id)
  const khataIds = TEST_KHATA_ACCOUNTS.map((k) => k.id)
  const userIds = TEST_USERS.map((u) => u.id)

  // ── 1. Order items (depend on orders) ──────────────────────────
  const { error: itemsErr } = await supabase
    .from('order_items')
    .delete()
    .in('order_id', orderIds)

  if (itemsErr) console.warn('[DB Cleanup] order_items delete warning:', itemsErr.message)

  // ── 2. Orders ──────────────────────────────────────────────────
  const { error: ordersErr } = await supabase
    .from('orders')
    .delete()
    .in('id', orderIds)

  if (ordersErr) console.warn('[DB Cleanup] orders delete warning:', ordersErr.message)

  // ── 3. Inventory movements (depend on products) ────────────────
  const { error: invErr } = await supabase
    .from('inventory_movements')
    .delete()
    .in('product_id', productIds)

  if (invErr) console.warn('[DB Cleanup] inventory_movements delete warning:', invErr.message)

  // ── 4. Khata transactions (depend on khata accounts) ───────────
  const { error: khataTxErr } = await supabase
    .from('khata_transactions')
    .delete()
    .in('account_id', khataIds)

  if (khataTxErr) console.warn('[DB Cleanup] khata_transactions delete warning:', khataTxErr.message)

  // ── 5. Khata accounts ──────────────────────────────────────────
  const { error: khataErr } = await supabase
    .from('khata_accounts')
    .delete()
    .in('id', khataIds)

  if (khataErr) console.warn('[DB Cleanup] khata_accounts delete warning:', khataErr.message)

  // ── 6. Products ────────────────────────────────────────────────
  const { error: productsErr } = await supabase
    .from('products')
    .delete()
    .in('id', productIds)

  if (productsErr) console.warn('[DB Cleanup] products delete warning:', productsErr.message)

  // ── 7. Entities ────────────────────────────────────────────────
  const { error: entityErr } = await supabase
    .from('entities')
    .delete()
    .eq('id', TEST_ENTITY.id)

  if (entityErr) console.warn('[DB Cleanup] entities delete warning:', entityErr.message)

  // ── 8. Auth users (via admin API) ──────────────────────────────
  for (const uid of userIds) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(uid)
    if (authErr) console.warn(`[DB Cleanup] auth user ${uid} delete warning:`, authErr.message)
  }

  console.log('[DB Cleanup] All test data removed')
}

module.exports = { cleanupDatabase }
