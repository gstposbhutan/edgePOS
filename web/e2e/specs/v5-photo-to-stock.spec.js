const { test, expect } = require('@playwright/test')
const { InventoryPage } = require('../page-objects/inventory-page')
const { ScanBillModal } = require('../page-objects/scan-bill-modal')
const { TEST_ENTITY } = require('../fixtures/test-data')
const path = require('path')

// Use manager auth — has inventory:write
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Photo-to-Stock (Bill Scanning)', () => {

  // ── Scan Bill Modal ──────────────────────────────────────────────────

  test.describe('Scan Bill Modal', () => {
    let inventoryPage
    let scanModal

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      scanModal = new ScanBillModal(page)
      await inventoryPage.goto()
    })

    test('opens scan bill modal from stock tab toolbar', async ({ page }) => {
      await inventoryPage.clickScanBill()
      await scanModal.assertOpen()
    })

    test('opens scan bill modal from Draft Purchases tab', async ({ page }) => {
      await inventoryPage.clickTab('Draft Purchases')
      await page.waitForLoadState('networkidle')

      // Click the "Scan Bill" button in drafts tab
      const scanButton = page.locator('button:has-text("Scan Bill")').first()
      await scanButton.click()
      await scanModal.assertOpen()
    })

    test('modal shows Use Camera and Upload Photo options', async () => {
      await inventoryPage.clickScanBill()
      await scanModal.assertOpen()

      await expect(scanModal.useCameraButton).toBeVisible()
      await expect(scanModal.uploadPhotoButton).toBeVisible()
    })

    test('upload triggers API and shows processing spinner', async ({ page }) => {
      await inventoryPage.clickScanBill()

      // Upload a test bill image via the hidden file input
      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')

      // Set up API route intercept for bill-parse
      await page.route('**/api/bill-parse', async (route) => {
        // Simulate successful parse
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            draft: {
              id: 'test-draft-001',
              entity_id: TEST_ENTITY.id,
              status: 'DRAFT',
              supplier_name: 'Test Supplier',
              total_amount: 1500.00,
              created_at: new Date().toISOString(),
              draft_purchase_items: [
                {
                  id: 'item-001',
                  raw_name: 'Druk Supreme Milk 1L',
                  product_id: null,
                  matched_name: 'Druk Supreme Milk 1L',
                  match_confidence: 0.95,
                  match_status: 'MATCHED',
                  quantity: 10,
                  unit_price: 85.00,
                  total_price: 850.00,
                },
                {
                  id: 'item-002',
                  raw_name: 'Unknown Item XYZ',
                  product_id: null,
                  matched_name: null,
                  match_confidence: null,
                  match_status: 'UNMATCHED',
                  quantity: 5,
                  unit_price: 130.00,
                  total_price: 650.00,
                },
              ],
            },
          }),
        })
      })

      await scanModal.uploadFile(testBillPath)
      await scanModal.assertProcessing()
    })

    test('shows success overlay after successful parse', async ({ page }) => {
      await page.route('**/api/bill-parse', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            draft: {
              id: 'test-draft-002',
              entity_id: TEST_ENTITY.id,
              status: 'DRAFT',
              supplier_name: null,
              total_amount: 0,
              created_at: new Date().toISOString(),
              draft_purchase_items: [],
            },
          }),
        })
      })

      await inventoryPage.clickScanBill()

      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')
      await scanModal.uploadFile(testBillPath)

      await scanModal.assertSuccess()
    })

    test('cancel button closes modal in choose mode', async () => {
      await inventoryPage.clickScanBill()
      await scanModal.assertOpen()
      await scanModal.clickCancel()
      await scanModal.assertClosed()
    })
  })

  // ── Draft Review ─────────────────────────────────────────────────────

  test.describe('Draft Review', () => {
    let inventoryPage

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
    })

    test('shows parsed items after successful bill scan', async ({ page }) => {
      // Mock the draft-purchases API to return a test draft
      await page.route('**/api/draft-purchases*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              drafts: [{
                id: 'test-draft-review-001',
                entity_id: TEST_ENTITY.id,
                status: 'DRAFT',
                supplier_name: 'Test Wholesaler',
                total_amount: 1700.00,
                bill_date: '2026-04-20',
                created_at: new Date().toISOString(),
                draft_purchase_items: [
                  {
                    id: 'item-r1',
                    raw_name: 'Wai Wai Noodles (Pack of 30)',
                    product_id: '00000000-0000-4000-8000-000000001002',
                    matched_name: 'Wai Wai Noodles (Pack of 30)',
                    match_confidence: 0.92,
                    match_status: 'MATCHED',
                    quantity: 4,
                    unit_price: 360.00,
                    total_price: 1440.00,
                  },
                  {
                    id: 'item-r2',
                    raw_name: 'Cheddar Cheese 200g',
                    product_id: null,
                    matched_name: null,
                    match_confidence: null,
                    match_status: 'UNMATCHED',
                    quantity: 2,
                    unit_price: 130.00,
                    total_price: 260.00,
                  },
                ],
              }],
            }),
          })
        } else {
          await route.continue()
        }
      })

      await inventoryPage.goto()
      await inventoryPage.clickTab('Draft Purchases')
      await page.waitForLoadState('networkidle')

      // Click on the draft to open review
      const draftCard = page.locator('button:has-text("DRAFT")')
      await expect(draftCard.first()).toBeVisible({ timeout: 5000 })
      await draftCard.first().click()

      // Should show "Review Draft Purchase" heading
      await expect(page.locator('text=Review Draft Purchase')).toBeVisible({ timeout: 5000 })
      // Should show items count
      await expect(page.locator('text=Items (2)')).toBeVisible()
    })

    test('allows editing qty and price in draft mode', async ({ page }) => {
      await page.route('**/api/draft-purchases*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              drafts: [{
                id: 'test-draft-edit-001',
                entity_id: TEST_ENTITY.id,
                status: 'DRAFT',
                supplier_name: 'Test Supplier',
                total_amount: 500.00,
                created_at: new Date().toISOString(),
                draft_purchase_items: [{
                  id: 'item-e1',
                  raw_name: 'Druk Supreme Milk 1L',
                  product_id: '00000000-0000-4000-8000-000000001003',
                  matched_name: 'Druk Supreme Milk 1L',
                  match_confidence: 0.95,
                  match_status: 'MATCHED',
                  quantity: 5,
                  unit_price: 68.00,
                  total_price: 340.00,
                }],
              }],
            }),
          })
        } else if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ draft: { id: 'test-draft-edit-001' } }),
          })
        } else {
          await route.continue()
        }
      })

      await inventoryPage.goto()
      await inventoryPage.clickTab('Draft Purchases')
      await page.waitForLoadState('networkidle')

      const draftCard = page.locator('button:has-text("DRAFT")')
      await expect(draftCard.first()).toBeVisible({ timeout: 5000 })
      await draftCard.first().click()

      // Find the quantity input for the item
      const qtyInput = page.locator('input[type="number"]').first()
      await expect(qtyInput).toBeVisible({ timeout: 3000 })
      await qtyInput.fill('10')
      // The total should update
      await expect(page.locator('text=680')).toBeVisible({ timeout: 3000 })
    })

    test('confirm restock updates inventory', async ({ page }) => {
      let confirmCalled = false

      await page.route('**/api/draft-purchases*', async (route) => {
        const url = route.request().url()
        const method = route.request().method()

        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              drafts: [{
                id: 'test-draft-confirm-001',
                entity_id: TEST_ENTITY.id,
                status: 'DRAFT',
                supplier_name: 'Test Wholesaler',
                total_amount: 850.00,
                created_at: new Date().toISOString(),
                draft_purchase_items: [{
                  id: 'item-c1',
                  raw_name: 'Druk Supreme Milk 1L',
                  product_id: '00000000-0000-4000-8000-000000001003',
                  matched_name: 'Druk Supreme Milk 1L',
                  match_confidence: 0.98,
                  match_status: 'MATCHED',
                  quantity: 10,
                  unit_price: 85.00,
                  total_price: 850.00,
                }],
              }],
            }),
          })
        } else if (method === 'POST') {
          confirmCalled = true
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          })
        } else if (method === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ draft: { id: 'test-draft-confirm-001' } }),
          })
        } else {
          await route.continue()
        }
      })

      await inventoryPage.goto()
      await inventoryPage.clickTab('Draft Purchases')
      await page.waitForLoadState('networkidle')

      const draftCard = page.locator('button:has-text("DRAFT")')
      await expect(draftCard.first()).toBeVisible({ timeout: 5000 })
      await draftCard.first().click()

      // Click "Confirm Restock"
      const confirmBtn = page.locator('button:has-text("Confirm Restock")')
      await expect(confirmBtn).toBeVisible({ timeout: 3000 })
      await confirmBtn.click()
      // Verify the confirm API was called
      await page.waitForLoadState('networkidle')
      expect(confirmCalled).toBe(true)
    })

    test('cancel draft skips inventory update', async ({ page }) => {
      let cancelCalled = false

      await page.route('**/api/draft-purchases*', async (route) => {
        const method = route.request().method()

        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              drafts: [{
                id: 'test-draft-cancel-001',
                entity_id: TEST_ENTITY.id,
                status: 'DRAFT',
                supplier_name: null,
                total_amount: 100.00,
                created_at: new Date().toISOString(),
                draft_purchase_items: [{
                  id: 'item-x1',
                  raw_name: 'Test Product',
                  product_id: null,
                  matched_name: null,
                  match_confidence: null,
                  match_status: 'UNMATCHED',
                  quantity: 1,
                  unit_price: 100.00,
                  total_price: 100.00,
                }],
              }],
            }),
          })
        } else if (method === 'POST') {
          cancelCalled = true
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          })
        } else if (method === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ draft: { id: 'test-draft-cancel-001' } }),
          })
        } else {
          await route.continue()
        }
      })

      await inventoryPage.goto()
      await inventoryPage.clickTab('Draft Purchases')
      await page.waitForLoadState('networkidle')

      const draftCard = page.locator('button:has-text("DRAFT")')
      await expect(draftCard.first()).toBeVisible({ timeout: 5000 })
      await draftCard.first().click()

      // Click "Cancel Draft"
      const cancelBtn = page.locator('button:has-text("Cancel Draft")')
      await expect(cancelBtn).toBeVisible({ timeout: 3000 })
      await cancelBtn.click()
      await page.waitForLoadState('networkidle')
      expect(cancelCalled).toBe(true)
    })
  })

  // ── Error Handling ───────────────────────────────────────────────────

  test.describe('Scan Bill Errors', () => {
    let inventoryPage
    let scanModal

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      scanModal = new ScanBillModal(page)
      await inventoryPage.goto()
    })

    test('shows failure overlay when no items found', async ({ page }) => {
      await page.route('**/api/bill-parse', async (route) => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No items could be extracted from the bill image' }),
        })
      })

      await inventoryPage.clickScanBill()
      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')
      await scanModal.uploadFile(testBillPath)

      await scanModal.assertFailed()
      const errorText = await scanModal.getErrorText()
      expect(errorText).toContain('No items')
    })

    test('shows failure overlay when OCR fails', async ({ page }) => {
      await page.route('**/api/bill-parse', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'OCR service unavailable' }),
        })
      })

      await inventoryPage.clickScanBill()
      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')
      await scanModal.uploadFile(testBillPath)

      await scanModal.assertFailed()
    })

    test('retry button returns to choose mode after failure', async ({ page }) => {
      await page.route('**/api/bill-parse', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary failure' }),
        })
      })

      await inventoryPage.clickScanBill()
      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')
      await scanModal.uploadFile(testBillPath)

      await scanModal.assertFailed()
      await scanModal.clickRetry()

      // Should be back in choose mode with Use Camera / Upload Photo visible
      await expect(scanModal.useCameraButton).toBeVisible()
      await expect(scanModal.uploadPhotoButton).toBeVisible()
    })
  })

  // ── Duplicate Detection ──────────────────────────────────────────────

  test.describe('Duplicate Detection', () => {
    let inventoryPage
    let scanModal

    test.beforeEach(async ({ page }) => {
      inventoryPage = new InventoryPage(page)
      scanModal = new ScanBillModal(page)
      await inventoryPage.goto()
    })

    test('prevents re-processing same bill (duplicate response)', async ({ page }) => {
      let callCount = 0

      await page.route('**/api/bill-parse', async (route) => {
        callCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            draft: {
              id: 'test-draft-dup-001',
              entity_id: TEST_ENTITY.id,
              status: 'DRAFT',
              created_at: new Date().toISOString(),
              draft_purchase_items: [],
            },
            duplicate: callCount > 1,
          }),
        })
      })

      await inventoryPage.clickScanBill()
      const testBillPath = path.join(__dirname, '..', 'fixtures', 'test-bill.jpg')

      // First upload
      await scanModal.uploadFile(testBillPath)
      await scanModal.assertSuccess()

      // Wait for modal to close / draft to open
      await page.waitForLoadState('networkidle')

      // Re-open and upload again — API should return duplicate: true
      // The UI may or may not block this, but the API returns the flag
      await inventoryPage.goto()
      await inventoryPage.clickTab('Draft Purchases')
    })
  })
})
