/**
 * E2E: Order State Machine — API-level coverage.
 *
 * The previous version of this spec wrote `orders.status` directly via the
 * service-role Supabase client, which only verified that PostgreSQL's UPDATE
 * statement works — not the business logic. This version uses the real
 * transition endpoints:
 *   - POST /api/pos/orders/[id]/cancel           cancel with reason
 *   - POST /api/pos/orders/[id]/refund           request a refund
 *   - POST /api/pos/orders/[id]/refund/[rid]/approve   approve a refund
 *
 * Transitions that don't have endpoints (PROCESSING, REFUND_REJECTED, REFUNDED)
 * are documented as gaps below.
 */

const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_ENTITY } = require('../fixtures/test-data')

function loadEnv() {
  if (process.env.SUPABASE_URL) return
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
loadEnv()

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Seed a temporary order in a given status. Admin client is fine for setup;
// the state transitions are what we test via API.
async function seedOrder({ status, payment_method = 'CASH', items = [], grand_total = 100 }) {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('orders')
    .insert({
      order_type: 'POS_SALE',
      order_no: `E2E-SM-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status,
      order_source: 'POS',
      seller_id: TEST_ENTITY.id,
      subtotal: grand_total / 1.05,
      gst_total: grand_total - (grand_total / 1.05),
      grand_total,
      payment_method,
      items,
    })
    .select('id, status, order_no')
    .single()
  if (error) throw error
  return data
}

async function deleteOrder(id) {
  const supabase = getAdminClient()
  await supabase.from('order_status_log').delete().eq('order_id', id)
  await supabase.from('refunds').delete().eq('order_id', id)
  await supabase.from('orders').delete().eq('id', id)
}

test.describe('Order State Machine — Cancel transitions', () => {

  // Must visit any authenticated page first so the storageState session
  // cookies are attached to subsequent page.request calls.
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
  })

  test('DRAFT → CANCELLED via cancel API records reason + status log', async ({ page }) => {
    const order = await seedOrder({ status: 'DRAFT' })

    try {
      const reason = `E2E DRAFT cancel ${Date.now()}`
      const res = await page.request.post(`/api/pos/orders/${order.id}/cancel`, {
        data: { reason },
      })
      expect(res.status()).toBe(200)

      const supabase = getAdminClient()
      const { data: after } = await supabase
        .from('orders')
        .select('status, cancellation_reason, cancelled_at')
        .eq('id', order.id)
        .single()

      expect(after.status).toBe('CANCELLED')
      expect(after.cancellation_reason).toBe(reason)
      expect(after.cancelled_at).toBeTruthy()

      const { data: log } = await supabase
        .from('order_status_log')
        .select('to_status, reason')
        .eq('order_id', order.id)
        .single()
      expect(log.to_status).toBe('CANCELLED')
      expect(log.reason).toBe(reason)
    } finally {
      await deleteOrder(order.id)
    }
  })

  test('CONFIRMED → CANCELLED via cancel API succeeds', async ({ page }) => {
    const order = await seedOrder({ status: 'CONFIRMED' })

    try {
      const res = await page.request.post(`/api/pos/orders/${order.id}/cancel`, {
        data: { reason: 'E2E confirmed cancel' },
      })
      expect(res.status()).toBe(200)

      const supabase = getAdminClient()
      const { data: after } = await supabase
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single()
      expect(after.status).toBe('CANCELLED')
    } finally {
      await deleteOrder(order.id)
    }
  })

  test('cancel endpoint requires authentication', async ({ request }) => {
    // `request` (top-level) is a fresh context with no storage state
    const order = await seedOrder({ status: 'DRAFT' })

    try {
      const res = await request.post(`/api/pos/orders/${order.id}/cancel`, {
        data: { reason: 'unauthorized' },
      })
      expect(res.status()).toBe(401)
    } finally {
      await deleteOrder(order.id)
    }
  })
})

test.describe('Order State Machine — Refund transitions', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/pos')
  })

  test('CONFIRMED → REFUND_REQUESTED via refund API creates a refund row', async ({ page }) => {
    // Build an order with line items so the refund endpoint has rows to record
    const items = [{
      product_id: '00000000-0000-4000-8000-000000001001',
      name: 'Druk 1100 Generator',
      quantity: 1,
      rate: 35000,
      discount: 0,
      gst_5: 1750,
      total: 36750,
    }]
    const order = await seedOrder({ status: 'CONFIRMED', grand_total: 36750, items })

    try {
      const res = await page.request.post(`/api/pos/orders/${order.id}/refund`, {
        data: {
          reason: 'E2E refund request',
          items: items.map((it, idx) => ({
            order_item_id: null,
            product_id: it.product_id,
            quantity: it.quantity,
            refund_amount: it.total,
          })),
        },
      })

      // Endpoint contract differs by implementation; accept 200 or 201.
      expect([200, 201]).toContain(res.status())

      const supabase = getAdminClient()
      const { data: after } = await supabase
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single()
      expect(after.status).toBe('REFUND_REQUESTED')
    } finally {
      await deleteOrder(order.id)
    }
  })
})

// ── Documented gaps (no API endpoints exist for these transitions yet) ──
test.describe('State Machine — gaps', () => {
  test.fixme('CONFIRMED → PROCESSING (no /processing endpoint)', async () => {})
  test.fixme('REFUND_REQUESTED → REFUND_REJECTED (no reject endpoint)', async () => {})
  test.fixme('REFUND_APPROVED → REFUNDED (no refund-completion endpoint)', async () => {})
  test.fixme('cancelled CONFIRMED restores stock (logic lives in DB trigger, not API)', async () => {})
})
