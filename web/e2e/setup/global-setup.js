const { seedDatabase } = require('../fixtures/db-seed')
const { createClient } = require('@supabase/supabase-js')
const { TEST_ENTITY, TEST_USERS } = require('../fixtures/test-data')

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') })
} catch (_) {}

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Skip the heavy seed if the sentinel rows already exist. Override with
// E2E_FORCE_SEED=1 to re-seed unconditionally (after schema/data changes).
async function alreadySeeded(supabase) {
  if (process.env.E2E_FORCE_SEED === '1') return false
  if (process.env.E2E_SKIP_SEED === '1') return true
  const { data: entity } = await supabase.from('entities').select('id').eq('id', TEST_ENTITY.id).maybeSingle()
  if (!entity) return false
  const { count } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', TEST_ENTITY.id)
  return (count ?? 0) >= TEST_USERS.length
}

async function globalSetup(config) {
  const supabase = getClient()

  if (supabase && await alreadySeeded(supabase)) {
    console.log('[E2E Setup] Skipping seed — sentinel rows present (set E2E_FORCE_SEED=1 to override)')
  } else {
    console.log('[E2E Setup] Seeding test database...')
    await seedDatabase()
    console.log('[E2E Setup] Database seeded successfully')
  }

  // Always clear stale carts so each run starts fresh — cheap and tests assume it.
  if (supabase) {
    await supabase.from('cart_items').delete().neq('id', '00000000')
    await supabase.from('carts').delete().eq('status', 'ACTIVE')
    console.log('[E2E Setup] Cleared stale carts')
  }
}

module.exports = globalSetup
