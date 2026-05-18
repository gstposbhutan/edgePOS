const { test, expect } = require('@playwright/test')
const { seedDatabase } = require('../fixtures/db-seed')
const { MANAGER_USER, TEST_WHOLESALER, TEST_WHOLESALER_PRODUCTS } = require('../fixtures/test-data')

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

test.describe('v8c. API Debug', () => {
  test.beforeAll(async () => {
    loadEnv()
    await seedDatabase()
  })

  test('wholesale orders API works via cookie auth', async ({ page }) => {
    // Sign in via UI to get session cookies
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(MANAGER_USER.email)
    await page.locator('input[type="password"]').fill(MANAGER_USER.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/pos', { timeout: 10000 })

    // Verify session is active
    const session = await page.evaluate(async () => {
      const res = await fetch('/api/auth/session')
      return res.json()
    })
    expect(session.user).toBeDefined()
    console.log('Session user:', session.user.email, 'entityId:', session.user.entityId)

    // Call the wholesale orders API (cookies sent automatically, no Bearer token needed)
    const items = [{
      product_id: TEST_WHOLESALER_PRODUCTS[0].id,
      quantity: 1,
    }]

    const response = await page.evaluate(async ({ wholesalerId, items }) => {
      const res = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wholesaler_id: wholesalerId, items }),
      })
      const data = await res.json()
      return { status: res.status, data }
    }, { wholesalerId: TEST_WHOLESALER.id, items })

    console.log('API Response:', response)

    expect(response.status).toBe(201)
    expect(response.data.order).toBeDefined()
    expect(response.data.order.order_no).toContain('WHL-')
  })
})
