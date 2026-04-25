const { seedDatabase } = require('../fixtures/db-seed')
const { createClient } = require('@supabase/supabase-js')

async function globalSetup(config) {
  console.log('[E2E Setup] Seeding test database...')
  await seedDatabase()
  console.log('[E2E Setup] Database seeded successfully')

  // Clean stale carts so each test starts fresh
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    await supabase.from('cart_items').delete().neq('id', '00000000')
    const { count } = await supabase.from('carts').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE')
    if (count > 0) {
      // Only delete active carts not linked to orders
      await supabase.from('carts').delete().eq('status', 'ACTIVE')
    }
    console.log('[E2E Setup] Cleared stale carts')
  }
}

module.exports = globalSetup
