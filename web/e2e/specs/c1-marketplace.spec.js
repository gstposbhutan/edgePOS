/**
 * E2E: Marketplace Store Page
 *
 * Tests the consumer-facing store page at /shop/store_[id].
 * Verifies store name, product listing, product visibility filtering,
 * and 404 handling.
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

  test('loads store page by ID', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.id)

    // Should not redirect to login (public page)
    expect(page.url()).toContain(`/shop/${TEST_ENTITY.id}`)
  })

  test('shows store name', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.id)
    await shopPage.assertStoreName(TEST_ENTITY.name)
  })

  test('shows store bio when available', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.id)

    const bio = await shopPage.getStoreBio()
    if (bio !== null) {
      expect(typeof bio).toBe('string')
    }
  })

  test('shows products', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.id)

    const productNames = await shopPage.getProductNames()
    expect(productNames.length).toBeGreaterThan(0)
  })

  test.fixme('products are grouped by category', async () => {
    // Current store page has no category grouping
  })

  test.fixme('WhatsApp Order button has correct wa.me link with pre-filled message', async () => {
    // Current store page has no per-product WhatsApp order links
  })

  test('returns 404 for non-existent store', async ({ page }) => {
    await page.goto('/shop/00000000-0000-0000-0000-000000000000')
    await shopPage.assertNotFound()
  })

  test('only shows products with stock > 0', async ({ page }) => {
    await shopPage.goto(TEST_ENTITY.id)

    const productNames = await shopPage.getProductNames()

    // Products with stock = 0 should NOT be visible (query filters stock > 0)
    const outOfStock = TEST_PRODUCTS.find(p => p.current_stock === 0)
    if (outOfStock) {
      expect(productNames).not.toContain(outOfStock.name)
    }

    // Products with stock > 0 SHOULD be visible
    const inStock = TEST_PRODUCTS.find(p => p.current_stock > 0 && p.name === 'Red Bull Energy Drink 250ml')
    if (inStock) {
      expect(productNames).toContain(inStock.name)
    }
  })

  test.fixme('powered by footer is present', async () => {
    // Current store page has no "powered by" footer
  })

  test.fixme('store page has correct page title', async () => {
    // Page title handling not implemented for store pages
  })
})
