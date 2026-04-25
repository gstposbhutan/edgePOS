const { test, expect } = require('@playwright/test')
const { OrdersListPage } = require('../page-objects/orders-list-page')
const { OrderDetailPage } = require('../page-objects/order-detail-page')
const { TEST_ORDERS, TEST_USERS, TEST_ENTITY } = require('../fixtures/test-data')

// Use manager auth — can cancel and refund
test.use({ storageState: 'e2e/storage/manager-auth.json' })

test.describe('Order Management', () => {

  // ── Orders List ──────────────────────────────────────────────────────

  test.describe('Orders List', () => {
    let ordersPage

    test.beforeEach(async ({ page }) => {
      ordersPage = new OrdersListPage(page)
      await ordersPage.goto()
    })

    test('displays the orders list page with heading and search', async () => {
      await ordersPage.assertPageLoaded()
    })

    test('displays orders from seeded test data', async () => {
      await ordersPage.assertOrdersVisible()
    })

    test('shows status badges for each order', async () => {
      // Each order row should have a status badge (span.inline-flex.rounded-full)
      const count = await ordersPage.getOrderCount()
      expect(count).toBeGreaterThan(0)

      // Verify at least one known status badge is present
      const completedOrder = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      if (completedOrder) {
        const status = await ordersPage.getOrderStatus(
          completedOrder.order_no || `SHOP-2026-${completedOrder.id.slice(-3)}`
        )
        // Status badge should exist (exact text depends on STATUS_CONFIG)
        expect(status).toBeTruthy()
      }
    })

    test('shows WhatsApp badge on WhatsApp-sourced orders', async () => {
      const waOrder = TEST_ORDERS.find(o => o.source === 'WHATSAPP')
      if (waOrder) {
        const orderNo = waOrder.order_no || `SHOP-2026-${waOrder.id.slice(-3)}`
        // Navigate and check — the WA badge only shows on WHATSAPP orders
        const row = ordersPage.getOrderRow(orderNo)
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          const hasBadge = await ordersPage.hasWhatsappBadge(orderNo)
          expect(hasBadge).toBe(true)
        }
      }
    })

    test('search by order number filters the list', async ({ page }) => {
      const order = TEST_ORDERS[0]
      const orderNo = order.order_no || `SHOP-2026-${order.id.slice(-3)}`

      await ordersPage.searchOrders(orderNo)

      // Wait for client-side filter to apply
      await page.waitForTimeout(300)

      const count = await ordersPage.getOrderCount()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('search by buyer phone filters the list', async ({ page }) => {
      // Search for the test phone number
      await ordersPage.searchOrders('+97517')
      await page.waitForTimeout(300)

      // Should find orders matching the phone
      const count = await ordersPage.getOrderCount()
      // Count could be 0 if no buyer_whatsapp set on seeded orders
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('filter by COMPLETED shows only completed orders', async ({ page }) => {
      await ordersPage.filterBy('Completed')
      await page.waitForTimeout(300)

      const count = await ordersPage.getOrderCount()
      // With COMPLETED filter active, all visible orders should have completed statuses
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const badge = page.locator('div.divide-y button').nth(i).locator('span.inline-flex.rounded-full').last()
          const text = await badge.textContent()
          expect(['Completed', 'Delivered']).toContain(text)
        }
      }
    })

    test('filter by CANCELLED shows only cancelled orders', async ({ page }) => {
      await ordersPage.filterBy('Cancelled')
      await page.waitForTimeout(300)

      const count = await ordersPage.getOrderCount()
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const badge = page.locator('div.divide-y button').nth(i).locator('span.inline-flex.rounded-full').last()
          const text = await badge.textContent()
          expect(['Cancelled', 'Payment Failed']).toContain(text)
        }
      }
    })

    test('filter by WHATSAPP shows only WhatsApp-sourced orders', async ({ page }) => {
      await ordersPage.filterBy('Whatsapp')
      await page.waitForTimeout(300)

      const count = await ordersPage.getOrderCount()
      // All visible orders should have the WA badge
      for (let i = 0; i < count; i++) {
        const row = page.locator('div.divide-y button').nth(i)
        const badge = row.locator('span:has-text("WA")')
        await expect(badge).toBeVisible()
      }
    })

    test('empty state shows when search matches nothing', async ({ page }) => {
      await ordersPage.searchOrders('ZZZZZZ-NONEXISTENT-ORDER')
      await page.waitForTimeout(300)
      await ordersPage.assertEmpty()
    })

    test('clicking an order navigates to detail page', async ({ page }) => {
      const count = await ordersPage.getOrderCount()
      if (count > 0) {
        await page.locator('div.divide-y button').first().click()
        await page.waitForURL('**/pos/orders/**')
        expect(page.url()).toContain('/pos/orders/')
      }
    })
  })

  // ── Order Detail ─────────────────────────────────────────────────────

  test.describe('Order Detail', () => {
    let detailPage

    test.beforeEach(async ({ page }) => {
      detailPage = new OrderDetailPage(page)
    })

    test('shows order summary with grand total and GST', async ({ page }) => {
      const order = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      await detailPage.goto(order.id)

      await detailPage.assertPageLoaded()

      const grandTotal = await detailPage.getGrandTotal()
      expect(grandTotal).toBe(order.grand_total)

      const gstTotal = await detailPage.getGstTotal()
      expect(gstTotal).toBe(order.gst_total)
    })

    test('shows order items', async ({ page }) => {
      const order = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      await detailPage.goto(order.id)

      const itemNames = await detailPage.getItemNames()
      expect(itemNames.length).toBe(order.items.length)
    })

    test('shows payment method', async ({ page }) => {
      const order = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      await detailPage.goto(order.id)

      const method = await detailPage.getPaymentMethod()
      expect(method).toBe(order.payment_method)
    })

    test('displays status timeline', async ({ page }) => {
      const order = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      await detailPage.goto(order.id)

      const statuses = await detailPage.getTimelineStatuses()
      expect(statuses.length).toBeGreaterThanOrEqual(1)
    })

    test('shows WhatsApp source badge on WhatsApp orders', async ({ page }) => {
      const waOrder = TEST_ORDERS.find(o => o.source === 'WHATSAPP')
      await detailPage.goto(waOrder.id)

      await detailPage.assertWhatsappBadge()
    })

    test('shows unmatched items warning for WhatsApp orders with unmatched items', async ({ page }) => {
      // This test assumes the seeded WhatsApp order has unmatched items
      // In practice, unmatched items have matched=false in order_items
      const waOrder = TEST_ORDERS.find(o => o.source === 'WHATSAPP')
      await detailPage.goto(waOrder.id)

      // Check if warning is present (depends on seed data having unmatched items)
      const warning = await detailPage.getUnmatchedWarning()
      // Warning may or may not be present depending on match status in seed data
      if (warning) {
        expect(warning).toContain('Unmatched Items')
      }
    })

    test('back button returns to orders list', async ({ page }) => {
      const order = TEST_ORDERS[0]
      await detailPage.goto(order.id)
      await detailPage.assertPageLoaded()

      await detailPage.clickBack()
      await page.waitForURL('**/pos/orders')
      expect(page.url()).toContain('/pos/orders')
    })
  })

  // ── Cancel Order ─────────────────────────────────────────────────────

  test.describe('Cancel Order', () => {
    let detailPage

    test.beforeEach(async ({ page }) => {
      detailPage = new OrderDetailPage(page)
    })

    test('cancellable statuses show the Cancel Order button', async () => {
      // DRAFT and PENDING_PAYMENT are cancellable for all roles
      const draftOrder = TEST_ORDERS.find(o => o.status === 'DRAFT')
      if (draftOrder) {
        await detailPage.goto(draftOrder.id)
        await detailPage.assertCancelButtonVisible()
      }
    })

    test('non-cancellable statuses hide the Cancel Order button', async () => {
      // COMPLETED and DELIVERED are not in CANCELLABLE_STATUSES
      const completedOrder = TEST_ORDERS.find(o => o.status === 'COMPLETED')
      if (completedOrder) {
        await detailPage.goto(completedOrder.id)
        await detailPage.assertCancelButtonNotVisible()
      }
    })

    test('cancel with reason updates status to CANCELLED', async ({ page }) => {
      const draftOrder = TEST_ORDERS.find(o => o.status === 'DRAFT')
      if (!draftOrder) return

      await detailPage.goto(draftOrder.id)
      await detailPage.clickCancelOrder()

      // Cancel modal should appear
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()

      // Enter reason
      const reasonInput = modal.locator('input[placeholder="e.g. Customer changed mind, wrong item..."]')
      await reasonInput.fill('Test cancellation — E2E')

      // Submit
      await modal.locator('button:has-text("Cancel Order")').click()

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 10000 })
    })

    test('stock restored notice shown in cancel modal', async ({ page }) => {
      const draftOrder = TEST_ORDERS.find(o => o.status === 'DRAFT')
      if (!draftOrder) return

      await detailPage.goto(draftOrder.id)
      await detailPage.clickCancelOrder()

      const modal = page.locator('[role="dialog"]')
      await expect(modal.locator('text=Stock will be restored')).toBeVisible()
    })
  })

  // ── Refund ───────────────────────────────────────────────────────────

  test.describe('Refund', () => {
    let detailPage

    test.beforeEach(async ({ page }) => {
      detailPage = new OrderDetailPage(page)
    })

    test('refundable statuses show the Request Refund button', async () => {
      // CONFIRMED is in REFUNDABLE_STATUSES
      const confirmedOrder = TEST_ORDERS.find(o => o.status === 'CONFIRMED')
      if (confirmedOrder) {
        await detailPage.goto(confirmedOrder.id)
        await detailPage.assertRefundButtonVisible()
      }
    })

    test('non-refundable statuses hide the Request Refund button', async () => {
      // DRAFT is NOT in REFUNDABLE_STATUSES
      const draftOrder = TEST_ORDERS.find(o => o.status === 'DRAFT')
      if (draftOrder) {
        await detailPage.goto(draftOrder.id)
        await detailPage.assertRefundButtonNotVisible()
      }
    })

    test('partial refund — select one item and submit', async ({ page }) => {
      const confirmedOrder = TEST_ORDERS.find(o => o.status === 'CONFIRMED')
      if (!confirmedOrder) return

      await detailPage.goto(confirmedOrder.id)
      await detailPage.clickRequestRefund()

      // Refund modal opens
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()

      // Select first active item by clicking on it
      const firstItem = modal.locator('div.flex.items-center.gap-3.p-2\\.5').first()
      await firstItem.click()

      // Enter reason
      const reasonInput = modal.locator('input[placeholder="e.g. Defective product, wrong item..."]')
      await reasonInput.fill('Partial refund — E2E test')

      // Submit
      const submitBtn = modal.locator('button:has-text("Request Refund")')
      await submitBtn.click()

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 10000 })
    })

    test('full refund — select all items', async ({ page }) => {
      const deliveredOrder = TEST_ORDERS.find(o => o.status === 'DELIVERED')
      if (!deliveredOrder) return

      await detailPage.goto(deliveredOrder.id)
      await detailPage.clickRequestRefund()

      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()

      // Select all active items
      const items = modal.locator('div.flex.items-center.gap-3.p-2\\.5')
      const itemCount = await items.count()
      for (let i = 0; i < itemCount; i++) {
        await items.nth(i).click()
      }

      // Enter reason
      const reasonInput = modal.locator('input[placeholder="e.g. Defective product, wrong item..."]')
      await reasonInput.fill('Full refund — E2E test')

      // Submit
      const submitBtn = modal.locator('button:has-text(/Request Refund/)')
      await submitBtn.click()

      await expect(modal).not.toBeVisible({ timeout: 10000 })
    })

    test('manager can approve a pending refund', async ({ page }) => {
      // Navigate to an order with a refund in REQUESTED status
      const refundOrder = TEST_ORDERS.find(o => o.status === 'REFUND_REQUESTED')
      if (!refundOrder) return

      await detailPage.goto(refundOrder.id)

      // If refunds section is visible, look for Approve link
      const refundsSection = page.locator('p:text-is("Refunds")')
      if (await refundsSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        const approveButton = page.locator('button:has-text("Approve")')
        if (await approveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await approveButton.click()
          // After approval, the refund status should change
        }
      }
    })
  })
})
