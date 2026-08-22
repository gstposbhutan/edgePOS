const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_RIDER, TEST_ENTITY } = require('../fixtures/test-data')
const { RiderPage } = require('../page-objects/rider-page')

// Dispatch behaviour: rejecting re-dispatches to the next on-shift rider; when no one is left it goes
// UNDELIVERABLE. Small + focused (paired with rider-delivery).

function loadEnv() {
  if (process.env.SUPABASE_URL) return
  try {
    const fs = require('fs'); const path = require('path')
    const envContent = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf-8')
    for (const line of envContent.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (m) process.env[m[1].trim()] = m[2].trim()
    }
  } catch {}
}
loadEnv()

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function seedAssignedOrder(supabase, riderId) {
  const year = new Date().getFullYear()
  const { data: last } = await supabase.from('orders').select('order_no')
    .like('order_no', `MKT-${year}-%`).order('order_no', { ascending: false }).limit(1).maybeSingle()
  const serial = (last?.order_no ? parseInt(last.order_no.split('-')[2] ?? '0', 10) : 0) + 1
  const orderNo = `MKT-${year}-${String(serial).padStart(5, '0')}`
  const { data: order } = await supabase.from('orders').insert({
    order_type: 'MARKETPLACE', order_no: orderNo, order_source: 'MARKETPLACE_WEB', status: 'CONFIRMED',
    fulfilment_mode: 'DELIVERY', dispatch_state: 'ASSIGNED', seller_id: TEST_ENTITY.id, buyer_whatsapp: '+97517100011',
    items: [{ sku: 'E2E', name: 'E2E', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
    subtotal: 100, gst_total: 5, grand_total: 105, payment_method: 'CREDIT',
    delivery_address: 'Thimphu (e2e dispatch)', rider_id: riderId, assigned_at: new Date().toISOString(),
    pickup_otp: '123456', pickup_otp_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  }).select('id, order_no').single()
  await supabase.from('order_items').insert({
    order_id: order.id, name: 'E2E', quantity: 1, unit_price: 100, discount: 0, gst_5: 5, total: 105, status: 'ACTIVE',
  })
  return order
}

async function riderIdByPhone(supabase, phone) {
  const { data } = await supabase.from('riders').select('id').eq('whatsapp_no', phone).maybeSingle()
  return data?.id
}

test.describe('Rider dispatch — reject re-dispatches, undeliverable when no one left', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('reject re-dispatches the order to another on-shift rider', async ({ page }) => {
    const supabase = getAdminClient()
    await supabase.from('riders').update({ is_available: false }).eq('is_active', true)
    await supabase.from('riders').update({ is_available: true }).in('whatsapp_no', [TEST_RIDER.phone, '+97517800001'])
    const otherId = await riderIdByPhone(supabase, '+97517800001')
    const order = await seedAssignedOrder(supabase, TEST_RIDER.id)

    const rider = new RiderPage(page)
    await rider.gotoLogin(); await rider.login(TEST_RIDER.email)

    const res = await page.request.post(`/api/rider/orders/${order.id}/reject`)
    expect(res.ok()).toBeTruthy()

    const { data: after } = await supabase
      .from('orders').select('rider_id, declined_rider_ids').eq('id', order.id).single()
    expect(after.rider_id).toBe(otherId)
    expect(after.declined_rider_ids).toContain(TEST_RIDER.id)

    await supabase.from('riders').update({ is_available: true }).eq('is_active', true)
  })

  test('order becomes UNDELIVERABLE when the only on-shift rider rejects it', async ({ page }) => {
    const supabase = getAdminClient()
    await supabase.from('riders').update({ is_available: false }).eq('is_active', true)
    await supabase.from('riders').update({ is_available: true }).eq('id', TEST_RIDER.id)
    const order = await seedAssignedOrder(supabase, TEST_RIDER.id)

    const rider = new RiderPage(page)
    await rider.gotoLogin(); await rider.login(TEST_RIDER.email)

    const res = await page.request.post(`/api/rider/orders/${order.id}/reject`)
    expect(res.ok()).toBeTruthy()

    const { data: after } = await supabase
      .from('orders').select('rider_id, dispatch_state, declined_rider_ids').eq('id', order.id).single()
    expect(after.rider_id).toBeNull()
    expect(after.dispatch_state).toBe('UNDELIVERABLE')
    expect(after.declined_rider_ids).toContain(TEST_RIDER.id)

    // A non-customer (the rider here) cannot cancel — the buyer-only endpoint is guarded.
    const cancelGuard = await page.request.post(`/api/shop/orders/${order.id}/cancel`)
    expect([401, 403]).toContain(cancelGuard.status())

    await supabase.from('riders').update({ is_available: true }).eq('is_active', true)
  })
})
