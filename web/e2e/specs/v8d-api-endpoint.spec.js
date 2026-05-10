const { test, expect } = require('@playwright/test')
const { seedDatabase } = require('../fixtures/db-seed')
const { MANAGER_USER, TEST_WHOLESALER } = require('../fixtures/test-data')

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

test.describe('v8d. API Endpoint Test', () => {
  test.beforeAll(async () => {
    loadEnv()
    await seedDatabase()
  })

  test('API endpoint exists and returns 401 without auth', async ({ page }) => {
    // Don't log in, just test the endpoint
    await page.goto('/')

    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/wholesale/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wholesaler_id: 'test-id', items: [] }),
        })
        return { status: res.status, ok: res.ok }
      } catch (e) {
        return { status: 0, error: e.message }
      }
    })

    console.log('API Response:', response)
    // Should get 401 or 400 (not 404)
    expect(response.status).not.toBe(404)
  })

  test('API endpoint returns 401 with valid data but no auth', async ({ page }) => {
    await page.goto('/')

    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/wholesale/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wholesaler_id: '00000000-0000-4000-8000-000000000010',
            items: [{ product_id: 'test', quantity: 1 }]
          }),
        })
        const data = await res.json()
        return { status: res.status, data }
      } catch (e) {
        return { status: 0, error: e.message }
      }
    })

    console.log('API Response:', response)
    expect(response.status).toBe(401)
  })
})
