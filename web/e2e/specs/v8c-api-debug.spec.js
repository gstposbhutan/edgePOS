const { test, expect } = require('@playwright/test')
const { seedDatabase } = require('../fixtures/db-seed')
const { MANAGER_USER, TEST_WHOLESALER, TEST_WHOLESALER_PRODUCTS } = require('../fixtures/test-data')

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

test.describe('v8c. API Debug', () => {
  test.beforeAll(async () => {
    loadEnv()
    await seedDatabase()
  })

  test('wholesale orders API works', async ({ page }) => {
    // Sign in
    loadEnv()
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(MANAGER_USER.email)
    await page.locator('input[type="password"]').fill(MANAGER_USER.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/pos', { timeout: 10000 })

    // Get session token
    const storageInfo = await page.evaluate(() => {
      // List all localStorage keys
      const keys = Object.keys(localStorage)
      const authKey = keys.find(k => k.includes('auth-token'))

      if (authKey) {
        const data = JSON.parse(localStorage.getItem(authKey))
        return {
          keys,
          authKey,
          hasCurrentSession: !!data.currentSession,
          hasUser: !!data.user,
          userId: data.user?.id,
          userAppMetadata: data.user?.app_metadata,
          token: data.currentSession?.access_token
        }
      }
      return { keys, authKey: null }
    })

    console.log('Storage info:', JSON.stringify(storageInfo, null, 2))

    const token = storageInfo.token
    const user = storageInfo.userAppMetadata ? { app_metadata: storageInfo.userAppMetadata } : null

    // Call the API directly
    const items = [{
      product_id: TEST_WHOLESALER_PRODUCTS[0].id,
      quantity: 1,
    }]

    const response = await page.evaluate(async ({ token, wholesalerId, items }) => {
      const res = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ wholesaler_id: wholesalerId, items }),
      })
      const data = await res.json()
      return { status: res.status, data }
    }, { token, wholesalerId: TEST_WHOLESALER.id, items })

    console.log('API Response:', response)

    expect(response.status).toBe(201)
    expect(response.data.order).toBeDefined()
    expect(response.data.order.order_no).toContain('WHL-')
  })
})
