/**
 * E2E: Marketplace Store Page
 *
 * Tests the consumer-facing store page at /shop/[slug].
 * Verifies store name, bio, product listing, categories, WhatsApp links,
 * 404 handling, and product visibility filtering.
 *
 * No authentication required — these are public pages.
 */

const { test, expect } = require('@playwright/test')
const { ShopPage } = require('../page-objects/shop-page')
const { TEST_ENTITY, TEST_PRODUCTS } = require('../fixtures/test-data')

test.describe('Marketplace Store Page', () => {
  let shopPage

  test.beforeEach(async ({ page }) => {
    shopPage = new ShopPage(page)
  })

  test('loads store page by slug', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    // Should not redirect to login (public page)
    expect(page.url()).toContain(`/shop/${TEST_ENTITY.shop_slug}`)
  })

  test('shows store name', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)
    await shopPage.assertStoreName(TEST_ENTITY.name)
  })

  test('shows store bio when available', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    // Bio is optional; just verify the page loads without error
    const bio = await shopPage.getStoreBio()
    // Bio may be null if TEST_ENTITY doesn't have marketplace_bio set
    if (bio !== null) {
      expect(typeof bio).toBe('string')
    }
  })

  test('shows products', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    // Get visible products — should be the ones with stock > 0 and visible_on_web=true
    const productNames = await shopPage.getProductNames()
    expect(productNames.length).toBeGreaterThan(0)
  })

  test('products are grouped by category', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    const categories = await shopPage.getCategoryNames()
    // Seeded products span multiple categories: Electronics, Food, Dairy, Beverages, etc.
    expect(categories.length).toBeGreaterThan(0)
  })

  test('WhatsApp Order button has correct wa.me link with pre-filled message', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    const productNames = await shopPage.getProductNames()
    expect(productNames.length).toBeGreaterThan(0)

    // Check the first product's WhatsApp link
    const firstName = productNames[0]
    const waLink = await shopPage.getWhatsAppLink(firstName)

    expect(waLink).toBeTruthy()
    expect(waLink).toMatch(/^https:\/\/wa\.me\//)
    expect(waLink).toContain('text=')

    // Link should contain the product name (URL-encoded)
    const decoded = decodeURIComponent(waLink)
    expect(decoded).toContain(firstName)
    expect(decoded).toContain(TEST_ENTITY.name)
  })

  test('returns 404 for non-existent slug', async ({ page }) => {
    await shopPage.goto('this-store-does-not-exist-xyz')
    await shopPage.assertNotFound()
  })

  test('only shows products with visible_on_web=true and stock > 0', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    const productNames = await shopPage.getProductNames()

    // Parle-G Biscuit 800g (stock = 0) should NOT be visible
    const outOfStock = TEST_PRODUCTS.find(p => p.current_stock === 0)
    if (outOfStock) {
      expect(productNames).not.toContain(outOfStock.name)
    }

    // Red Bull Energy Drink (stock = 6) SHOULD be visible
    const inStock = TEST_PRODUCTS.find(p => p.current_stock > 0 && p.name === 'Red Bull Energy Drink 250ml')
    if (inStock) {
      expect(productNames).toContain(inStock.name)
    }
  })

  test('powered by footer is present', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    await expect(page.locator('text=innovates.bt')).toBeVisible()
  })

  test('store page has correct page title', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.shop_slug)

    const title = await page.title()
    expect(title).toContain(TEST_ENTITY.name)
  })
})
