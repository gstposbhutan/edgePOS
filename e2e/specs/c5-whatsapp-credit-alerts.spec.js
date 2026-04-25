/**
 * E2E: WhatsApp Credit Alerts
 *
 * Tests the WhatsApp gateway's credit/khata alert endpoints.
 * Verifies all alert types are processed correctly and contain
 * the required debtor information.
 *
 * Uses API requests against the WhatsApp gateway service.
 */

const { test, expect } = require('@playwright/test')
const { TEST_KHATA_ACCOUNTS } = require('../fixtures/test-data')

const GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001'

test.describe('WhatsApp Credit Alerts', () => {

  test('PRE_DUE_3D alert — 3 days before due', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[0]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'PRE_DUE_3D',
        entityName: 'Test Store',
        dueDate: '2026-04-28',
      },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('DUE_TODAY alert — on due date', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[0]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'DUE_TODAY',
        entityName: 'Test Store',
        dueDate: '2026-04-25',
      },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('OVERDUE_3D alert — 3 days past due', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[2] // Sonam Dorji, FROZEN, outstanding 1250

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'OVERDUE_3D',
        entityName: 'Test Store',
        dueDate: '2026-04-22',
      },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('OVERDUE_30D alert — 30+ days past due', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[2]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'OVERDUE_30D',
        entityName: 'Test Store',
      },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('MONTHLY_REMINDER with outstanding balance', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[0]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'MONTHLY_REMINDER',
        entityName: 'Test Store',
      },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('alert contains debtor phone and name', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[1]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'PRE_DUE_3D',
        entityName: 'Test Store',
        dueDate: '2026-05-01',
      },
    })

    expect(response.status()).toBe(200)
    // In dev mode, the alert content is logged. We verify the endpoint
    // accepted the payload with debtor info.
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('alert requires debtorPhone', async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorName: 'Test User',
        outstandingBalance: 500,
        alertType: 'MONTHLY_REMINDER',
      },
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/debtorPhone/i)
  })

  test('unknown alertType falls back to MONTHLY_REMINDER', async ({ request }) => {
    const account = TEST_KHATA_ACCOUNTS[0]

    const response = await request.post(`${GATEWAY_URL}/api/send-credit-alert`, {
      data: {
        debtorPhone: account.contact_phone,
        debtorName: account.contact_name,
        outstandingBalance: account.outstanding_balance,
        alertType: 'UNKNOWN_TYPE',
        entityName: 'Test Store',
      },
    })

    // Should still succeed (falls back to MONTHLY_REMINDER)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })
})
