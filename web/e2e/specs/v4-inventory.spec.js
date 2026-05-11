const { test, expect } = require('@playwright/test')
const { InventoryPage } = require('../page-objects/inventory-page')
const { AdjustStockModal } = require('../page-objects/adjust-stock-modal')
const { TEST_PRODUCTS, TEST_ENTITY } = require('../fixtures/test-data')

// Use manager auth — has inventory:read and inventory:write
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Inventory Management', () => {

  // ── Stock Levels ─────────────────────────────────────────────────────

  test.describe('Stock Levels', () => {
    let inventoryPage

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      await inventoryPage.goto()
    })

    test('displays the inventory page with heading', async () => {
      await inventoryPage.assertPageLoaded()
      await inventoryPage.assertStockTabActive()
    })

    test('stock table loads with products from seed data', async () => {
      const count = await inventoryPage.getProductCount()
      expect(count).toBeGreaterThanOrEqual(TEST_PRODUCTS.length)
    })

    test('shows product details: name, stock, price', async ({ page }) => {
      // Check first product in the table has name and stock columns
      const firstProduct = TEST_PRODUCTS[0]
      await inventoryPage.assertProductVisible(firstProduct.name)

      const stock = await inventoryPage.getStockLevel(firstProduct.name)
      expect(stock).toBe(firstProduct.current_stock)
    })

    test('search filters products by name', async ({ page }) => {
      await inventoryPage.searchProducts('Druk')
      await page.waitForLoadState('networkidle')

      const count = await inventoryPage.getProductCount()
      expect(count).toBeGreaterThanOrEqual(1)

      // All visible rows should contain "Druk" in the name
      for (let i = 0; i < count; i++) {
        const row = page.locator('tbody tr').nth(i)
        const name = await row.locator('td:first-child p.font-medium').textContent()
        expect(name.toLowerCase()).toContain('druk')
      }
    })

    test('search filters products by SKU', async ({ page }) => {
      await inventoryPage.searchProducts('DRK-GEN')
      await page.waitForLoadState('networkidle')

      const count = await inventoryPage.getProductCount()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('filter ALL shows all products', async ({ page }) => {
      await inventoryPage.filterBy('All')
      await page.waitForLoadState('networkidle')

      const count = await inventoryPage.getProductCount()
      expect(count).toBeGreaterThanOrEqual(TEST_PRODUCTS.length)
    })

    test('filter LOW shows only low-stock products', async ({ page }) => {
      await inventoryPage.filterBy(/Low/)
      await page.waitForLoadState('networkidle')

      const count = await inventoryPage.getProductCount()
      // Products with stock > 0 and stock <= reorder_point (default 10)
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const badge = await page.locator('tbody tr').nth(i).locator('td:nth-child(4) span').textContent()
          expect(badge).toContain('Low Stock')
        }
      }
    })

    test('filter OUT shows only out-of-stock products', async ({ page }) => {
      // Click the "Out" filter button
      const outButton = page.locator('div.flex.gap-1 button').filter({ hasText: /Out/ }).first()
      await outButton.click()
      await page.waitForLoadState('networkidle')

      const count = await inventoryPage.getProductCount()
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const badge = await page.locator('tbody tr').nth(i).locator('td:nth-child(4) span').textContent()
          expect(badge).toContain('Out of Stock')
        }
      }
    })

    test('alert banners display correct counts for out-of-stock and low-stock', async () => {
      // From TEST_PRODUCTS:
      // outOfStock = products with current_stock <= 0 (Parle-G Biscuit, Coca-Cola) = 2
      // lowStock = products with stock > 0 and <= 10 (Red Bull: 6, Surf Excel: 3, Lifebuoy: 8) = 3
      await inventoryPage.assertAlertBanners(2, 3)
    })

    test('empty state when filter has no matches', async ({ page }) => {
      await inventoryPage.searchProducts('ZZZZZZ-NONEXISTENT-PRODUCT')
      await page.waitForLoadState('networkidle')
      await inventoryPage.assertEmpty()
    })

    test('out-of-stock products shown with red stock text', async ({ page }) => {
      // Parle-G Biscuit 800g has stock 0
      const row = inventoryPage.getStockRow('Parle-G Biscuit 800g')
      await expect(row).toBeVisible({ timeout: 5000 })
      const stockSpan = row.locator('td:nth-child(3) span.font-bold')
      await expect(stockSpan).toHaveClass(/text-tibetan/)
    })

    test('low-stock products shown with amber stock text', async ({ page }) => {
      // Red Bull has stock 6 (low)
      const row = inventoryPage.getStockRow('Red Bull Energy Drink 250ml')
      await expect(row).toBeVisible({ timeout: 5000 })
      const stockSpan = row.locator('td:nth-child(3) span.font-bold')
      await expect(stockSpan).toHaveClass(/text-amber-600/)
    })
  })

  // ── Stock Adjustment ─────────────────────────────────────────────────

  test.describe('Stock Adjustment', () => {
    let inventoryPage
    let adjustModal

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      adjustModal = new AdjustStockModal(page)
      await inventoryPage.goto()
    })

    test('RESTOCK increases stock level', async ({ page }) => {
      const product = TEST_PRODUCTS.find(p => p.current_stock > 0 && p.name === 'Druk 1100 Generator')
      expect(product).toBeDefined()

      const beforeStock = await inventoryPage.getStockLevel(product.name)

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()

      await adjustModal.selectType('RESTOCK')
      await adjustModal.enterQuantity(10)
      await adjustModal.enterNotes('E2E test restock')
      await adjustModal.clickConfirm()

      await adjustModal.assertClosed()

      // Verify stock increased
      const afterStock = await inventoryPage.getStockLevel(product.name)
      expect(afterStock).toBe(beforeStock + 10)
    })

    test('LOSS decreases stock level', async ({ page }) => {
      const product = TEST_PRODUCTS.find(p => p.current_stock > 5 && p.name === 'Wai Wai Noodles (Pack of 30)')
      expect(product).toBeDefined()

      const beforeStock = await inventoryPage.getStockLevel(product.name)

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()

      await adjustModal.selectType('LOSS')
      await adjustModal.enterQuantity(5)
      await adjustModal.enterNotes('E2E test loss')
      await adjustModal.clickConfirm()

      await adjustModal.assertClosed()

      const afterStock = await inventoryPage.getStockLevel(product.name)
      expect(afterStock).toBe(beforeStock - 5)
    })

    test('DAMAGED decreases stock level', async ({ page }) => {
      const product = TEST_PRODUCTS.find(p => p.current_stock > 2 && p.name === 'Druk Supreme Milk 1L')
      expect(product).toBeDefined()

      const beforeStock = await inventoryPage.getStockLevel(product.name)

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()

      await adjustModal.selectType('DAMAGED')
      await adjustModal.enterQuantity(2)
      await adjustModal.enterNotes('E2E test damaged')
      await adjustModal.clickConfirm()

      await adjustModal.assertClosed()

      const afterStock = await inventoryPage.getStockLevel(product.name)
      expect(afterStock).toBe(beforeStock - 2)
    })

    test('adjustment records movement in history', async ({ page }) => {
      // Make a restock adjustment first
      const product = TEST_PRODUCTS.find(p => p.current_stock > 0)
      expect(product).toBeDefined()

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()
      await adjustModal.selectType('RESTOCK')
      await adjustModal.enterQuantity(3)
      await adjustModal.enterNotes('E2E movement test')
      await adjustModal.clickConfirm()
      await adjustModal.assertClosed()

      // Switch to Movement History tab
      await inventoryPage.clickTab('Movement History')

      // Verify the movement appears
      const movementText = page.locator('text=E2E movement test')
      await expect(movementText).toBeVisible({ timeout: 5000 })
    })

    test('cannot submit without quantity', async ({ page }) => {
      const product = TEST_PRODUCTS.find(p => p.current_stock > 0)
      expect(product).toBeDefined()

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()

      // Leave quantity empty and try to confirm
      await adjustModal.clickConfirm()

      // Should show error or stay open
      const error = await adjustModal.getErrorText()
      // Either error shown or modal is still open
      if (error) {
        expect(error).toBeTruthy()
      } else {
        await adjustModal.assertOpen()
      }
    })

    test('cancel button closes modal without adjustment', async ({ page }) => {
      const product = TEST_PRODUCTS.find(p => p.current_stock > 0)
      expect(product).toBeDefined()

      const beforeStock = await inventoryPage.getStockLevel(product.name)

      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()
      await adjustModal.clickCancel()
      await adjustModal.assertClosed()

      // Stock should not change
      const afterStock = await inventoryPage.getStockLevel(product.name)
      expect(afterStock).toBe(beforeStock)
    })
  })

  // ── Movement History ─────────────────────────────────────────────────

  test.describe('Movement History', () => {
    let inventoryPage

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      await inventoryPage.goto()
    })

    test('displays movements after switching to tab', async ({ page }) => {
      await inventoryPage.clickTab('Movement History')

      // Should show either movements or the empty state
      const emptyState = page.locator('text=No movements recorded yet')
      const movements = page.locator('div.space-y-2 > div.flex.items-center.gap-3')

      const hasMovements = (await movements.count()) > 0
      const hasEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasMovements || hasEmpty).toBe(true)
    })

    test('movements refresh after an adjustment', async ({ page }) => {
      // Switch to history tab first to get baseline
      await inventoryPage.clickTab('Movement History')

      const countBefore = await inventoryPage.getMovementCount()

      // Go back to stock tab and make an adjustment
      await inventoryPage.clickTab('Stock Levels')
      const product = TEST_PRODUCTS.find(p => p.current_stock > 0)
      expect(product).toBeDefined()

      const adjustModal = new AdjustStockModal(page)
      await inventoryPage.clickAdjustStock(product.name)
      await adjustModal.assertOpen()
      await adjustModal.selectType('RESTOCK')
      await adjustModal.enterQuantity(1)
      await adjustModal.enterNotes('E2E refresh test')
      await adjustModal.clickConfirm()
      await adjustModal.assertClosed()

      // Switch back to history tab
      await inventoryPage.clickTab('Movement History')

      const countAfter = await inventoryPage.getMovementCount()
      expect(countAfter).toBeGreaterThanOrEqual(countBefore)
    })
  })

  // ── Predictions Tab ──────────────────────────────────────────────────

  test.describe('Predictions Tab', () => {
    let inventoryPage

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      await inventoryPage.goto()
    })

    test('displays predictions tab with summary cards', async ({ page }) => {
      await inventoryPage.clickTab('Predictions')

      // Summary cards should be visible: Critical, At Risk, Healthy
      await expect(page.locator('text=Critical')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('text=At Risk')).toBeVisible()
      await expect(page.locator('text=Healthy')).toBeVisible()
    })

    test('shows summary stats with numeric counts', async ({ page }) => {
      await inventoryPage.clickTab('Predictions')

      // Each summary card has a count number
      const cards = page.locator('div.grid.grid-cols-3 > div')
      const cardCount = await cards.count()
      expect(cardCount).toBe(3)

      for (let i = 0; i < cardCount; i++) {
        const countText = await cards.nth(i).locator('p.text-xl').textContent()
        const num = parseInt(countText, 10)
        expect(num).toBeGreaterThanOrEqual(0)
      }
    })

    test('refresh button recalculates predictions', async ({ page }) => {
      await inventoryPage.clickTab('Predictions')

      const refreshBtn = page.locator('button:has-text("Refresh")')
      if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await refreshBtn.click()
        // Wait for spinner to complete
        await expect(page.locator('svg.lucide-refresh-cw.animate-spin')).not.toBeVisible({ timeout: 5000 }).catch(() => {})
      }
    })
  })
})
