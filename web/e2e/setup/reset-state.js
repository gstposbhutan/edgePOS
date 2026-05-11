/**
 * Resets test database state between project suites.
 * Re-seeds product stock, cleans up carts and test-created orders,
 * and ensures the shift is active.
 */

const { createClient } = require('@supabase/supabase-js')
const {
  TEST_PRODUCTS,
  TEST_ENTITY,
  TEST_BATCHES,
  TEST_SHIFT,
  TEST_CASH_REGISTER,
} = require('../fixtures/test-data')

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(__dirname, '..', '..', '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
  } catch {}
}

async function resetTestState() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing env vars for resetTestState')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Delete all active carts and their items
  const { data: carts } = await supabase
    .from('carts')
    .select('id')
    .eq('entity_id', TEST_ENTITY.id)
    .eq('status', 'ACTIVE')
  if (carts?.length) {
    for (const c of carts) {
      await supabase.from('cart_items').delete().eq('cart_id', c.id)
    }
    await supabase.from('carts').delete().eq('entity_id', TEST_ENTITY.id).eq('status', 'ACTIVE')
  }

  // 2. Delete test-created orders (keep the 6 seed orders)
  // Seed order IDs follow the pattern 00000000-0000-4000-8000-00000000{3001-3006}
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('seller_id', TEST_ENTITY.id)
  if (allOrders?.length) {
    const seedOrderIds = new Set([
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000304',
      '00000000-0000-4000-8000-000000000305',
      '00000000-0000-4000-8000-000000000306',
    ])
    const toDelete = allOrders.filter(o => !seedOrderIds.has(o.id))
    if (toDelete.length) {
      await supabase.from('order_items').delete().in('order_id', toDelete.map(o => o.id))
      await supabase.from('orders').delete().in('id', toDelete.map(o => o.id))
    }
  }

  // 3. Re-seed product stock levels
  const stockUpdates = TEST_PRODUCTS.map(p =>
    supabase.from('products').update({ current_stock: p.current_stock }).eq('id', p.id)
  )
  await Promise.all(stockUpdates)

  // 4. Re-seed batch quantities
  const batchUpdates = TEST_BATCHES.map(b =>
    supabase.from('product_batches').update({ quantity: b.quantity }).eq('id', b.id)
  )
  await Promise.all(batchUpdates)

  // 5. Delete shift transactions and ensure shift is active
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id')
    .eq('entity_id', TEST_ENTITY.id)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (activeShift) {
    await supabase.from('shift_transactions').delete().eq('shift_id', activeShift.id)
  } else {
    // Close stale shifts and recreate
    const { data: staleShifts } = await supabase
      .from('shifts')
      .select('id')
      .eq('entity_id', TEST_ENTITY.id)
      .in('status', ['ACTIVE', 'CLOSING'])
    if (staleShifts?.length) {
      await supabase
        .from('shifts')
        .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
        .in('id', staleShifts.map(s => s.id))
    }
    // Ensure register exists
    await supabase.from('cash_registers').upsert(TEST_CASH_REGISTER, { onConflict: 'id' })
    // Get cashier profile for opened_by
    const { data: cashier } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('sub_role', 'CASHIER')
      .eq('entity_id', TEST_ENTITY.id)
      .maybeSingle()
    await supabase.from('shifts').upsert({
      ...TEST_SHIFT,
      opened_by: cashier?.id ?? TEST_SHIFT.opened_by,
      opened_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  }
}

module.exports = { resetTestState }
