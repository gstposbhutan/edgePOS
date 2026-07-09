const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_RIDER, TEST_ENTITY } = require('../fixtures/test-data')
const { RiderPage } = require('../page-objects/rider-page')

// Rider delivery flow (queue model, email-OTP login). Kept small + focused — see the sibling
// rider-dispatch spec for reject/undeliverable, and f1-marketplace-rider for the customer/vendor side.

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

// A CONFIRMED delivery order assigned to TEST_RIDER with a valid (mock) pickup OTP.
async function ensureAssignedRiderOrder() {
  const supabase = getAdminClient()
  await supabase.from('riders').update({ is_available: true }).eq('id', TEST_RIDER.id)

  const { data: existing } = await supabase
    .from('orders').select('id, order_no')
    .eq('rider_id', TEST_RIDER.id).eq('order_type', 'MARKETPLACE')
    .in('status', ['CONFIRMED', 'PROCESSING']).limit(1).maybeSingle()
  if (existing?.id) {
    await supabase.from('orders').update({
      status: 'CONFIRMED', pickup_otp: '123456',
      pickup_otp_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      delivery_otp: null, delivery_otp_expires_at: null,
    }).eq('id', existing.id)
    return { orderId: existing.id, orderNo: existing.order_no }
  }

  const year = new Date().getFullYear()
  const { data: last } = await supabase.from('orders').select('order_no')
    .like('order_no', `MKT-${year}-%`).order('order_no', { ascending: false }).limit(1).maybeSingle()
  const serial = (last?.order_no ? parseInt(last.order_no.split('-')[2] ?? '0', 10) : 0) + 1
  const orderNo = `MKT-${year}-${String(serial).padStart(5, '0')}`
  const { data: order, error } = await supabase.from('orders').insert({
    order_type: 'MARKETPLACE', order_no: orderNo, order_source: 'MARKETPLACE_WEB', status: 'CONFIRMED',
    fulfilment_mode: 'DELIVERY', dispatch_state: 'ASSIGNED', seller_id: TEST_ENTITY.id,
    buyer_whatsapp: '+97517100011',
    items: [{ sku: 'E2E', name: 'E2E Setup Item', quantity: 1, unit_price: 100, gst_5: 5, total: 105 }],
    subtotal: 100, gst_total: 5, grand_total: 105, payment_method: 'CREDIT',
    delivery_address: 'Changzamtog, Thimphu (e2e)', rider_id: TEST_RIDER.id, assigned_at: new Date().toISOString(),
    pickup_otp: '123456', pickup_otp_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  }).select('id, order_no').single()
  if (error) throw new Error('setup order insert failed: ' + error.message)
  await supabase.from('order_items').insert({
    order_id: order.id, name: 'E2E Setup Item', quantity: 1, unit_price: 100, discount: 0, gst_5: 5, total: 105, status: 'ACTIVE',
  })
  return { orderId: order.id, orderNo: order.order_no }
}

test.describe('Rider delivery — email-OTP login, queue, pickup + delivery handshake', () => {
  test.use({ storageState: 'e2e/storage/manager-auth.json' })

  test('rider logs in, sees the queue, picks up and delivers', async ({ page }) => {
    const { orderId, orderNo } = await ensureAssignedRiderOrder()
    const rider = new RiderPage(page)

    await rider.gotoLogin()
    await rider.login(TEST_RIDER.email)
    expect(page.url()).toContain('/rider')
    expect(page.url()).not.toContain('/rider/login')

    await rider.assertInQueue(orderNo)

    const q1 = await page.evaluate(async () => (await fetch('/api/rider/orders')).json())
    const queued = q1.queue.find((o) => o.id === orderId)
    expect(queued).toBeTruthy()
    expect(queued.pickup_otp).toBeTruthy()

    await rider.confirmPickup(orderNo, queued.pickup_otp)

    let deliveryOtp = null
    await expect.poll(async () => {
      const d = await page.evaluate(async () => (await fetch('/api/rider/orders')).json())
      deliveryOtp = d.queue.find((x) => x.id === orderId)?.delivery_otp || null
      return Boolean(deliveryOtp)
    }, { timeout: 8000, message: 'no delivery OTP after pickup' }).toBe(true)

    await rider.confirmDelivery(orderNo, deliveryOtp)
    await rider.assertNotInQueue(orderNo)

    const feeRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/rider/orders/${id}/fee`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_fee: 50 }),
      })
      return { ok: res.ok }
    }, orderId)
    expect(feeRes.ok).toBeTruthy()
  })
})
