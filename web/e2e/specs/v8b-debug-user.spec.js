const { test, expect } = require('@playwright/test')
const { seedDatabase } = require('../fixtures/db-seed')
const { MANAGER_USER } = require('../fixtures/test-data')

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

test.describe('v8b. Debug User Data', () => {
  test.beforeAll(async () => {
    loadEnv()
    await seedDatabase()
  })

  test('check user session via BFF API', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[fetchConnections]') ||
          msg.text().includes('[placeOrder]') ||
          msg.text().includes('[Debug]') ||
          msg.text().includes('Error')) {
        console.log('Browser console:', msg.text())
      }
    })

    // Sign in via UI
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(MANAGER_USER.email)
    await page.locator('input[type="password"]').fill(MANAGER_USER.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/pos', { timeout: 10000 })

    // Verify session via BFF API (cookies are sent automatically)
    const sessionData = await page.evaluate(async () => {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      return data
    })

    console.log('Session data from /api/auth/session:', JSON.stringify(sessionData, null, 2))
    expect(sessionData.user).toBeDefined()
    expect(sessionData.user.entityId).toBeDefined()

    // Open restock modal to trigger fetchConnections
    await page.locator('[data-testid="restock-btn"]').click()
    await page.waitForTimeout(3000)

    // Check if wholesalers are displayed
    const wholesalerList = page.locator('[data-testid="wholesaler-list"]')
    const isVisible = await wholesalerList.isVisible()
    console.log('Wholesaler list visible:', isVisible)

    const wholesalerCardCount = await page.locator('[data-testid^="wholesaler-"]').count()
    console.log('Wholesaler cards count:', wholesalerCardCount)

    const firstCard = page.locator('[data-testid^="wholesaler-"]').first()
    if (await firstCard.isVisible()) {
      const testId = await firstCard.getAttribute('data-testid')
      console.log('First wholesaler card testId:', testId)
    }

    const noWholesalers = page.locator('[data-testid="no-wholesalers"]')
    const noDataVisible = await noWholesalers.isVisible()
    console.log('No wholesalers message visible:', noDataVisible)

    const wsCards = page.locator('button[data-testid^="wholesaler-"]:not([data-testid="wholesaler-list"])')
    const cardCount = await wsCards.count()
    console.log('Wholesaler card count (excluding list):', cardCount)

    if (cardCount > 0) {
      console.log('Clicking first wholesaler card')
      await wsCards.first().click()
      await page.waitForTimeout(2000)

      const productGrid = page.locator('[data-testid="product-grid"]')
      const gridVisible = await productGrid.isVisible()
      console.log('Product grid visible:', gridVisible)

      if (gridVisible) {
        const products = page.locator('[data-testid^="product-"]')
        const productCount = await products.count()
        console.log('Product count in grid:', productCount)
      }

      const product = page.locator('button[data-testid^="product-"]').first()
      if (await product.isVisible({ timeout: 5000 })) {
        const productName = await product.getAttribute('data-testid')
        console.log('Clicking product:', productName)
        await product.click()
        await page.waitForTimeout(2000)

        const cartItems = page.locator('[data-testid^="cart-item-"]')
        const cartCount = await cartItems.count()
        console.log('Cart items count after clicking product:', cartCount)

        const placeOrderBtn = page.locator('[data-testid="place-order-btn"]')
        const isEnabled = await placeOrderBtn.isEnabled()
        console.log('Place order button enabled:', isEnabled)

        if (isEnabled) {
          console.log('Clicking place order button')
          await placeOrderBtn.click()
          await page.waitForTimeout(5000)

          const success = page.locator('[data-testid="restock-success"]')
          const error = page.locator('[data-testid="restock-error"]')
          const successVisible = await success.isVisible()
          const errorVisible = await error.isVisible()
          console.log('Success visible:', successVisible, 'Error visible:', errorVisible)
        }
      }
    }
  })
})
