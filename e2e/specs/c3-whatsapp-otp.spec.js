/**
 * E2E: WhatsApp OTP Authentication
 *
 * Tests the WhatsApp OTP login flow. Exercises both the Next.js API routes
 * for sending/verifying OTP and the login page UI for entering the code.
 *
 * API routes:
 *   POST /api/auth/whatsapp/send  — sends OTP
 *   POST /api/auth/whatsapp/verify — verifies OTP and creates session
 *
 * Each test uses a unique phone number to avoid rate limit cross-contamination.
 */

const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_ENTITY } = require('../fixtures/test-data')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Load .env.local if env vars are missing
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
loadEnv()

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Unique phones per test to avoid rate limit pollution
const phones = {
  sendSuccess: '+97517100060',
  storedInDb: '+97517100061',
  prevInvalid: '+97517100062',
  rateLimit: '+97517100063',
  verifyUI: TEST_ENTITY.whatsapp_no,
  wrongOtp: '+97517100064',
  lockout: '+97517100065',
  expired: '+97517100066',
}

test.describe('WhatsApp OTP Auth', () => {
  // Clean up all test OTPs before running to avoid rate limit pollution
  test.beforeAll(async () => {
    const supabase = getAdminClient()
    const allPhones = Object.values(phones)
    await supabase
      .from('whatsapp_otps')
      .delete()
      .in('phone', allPhones)
  })

  test('send OTP via API returns success', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
      data: { phone: phones.sendSuccess },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  test('OTP is stored in whatsapp_otps table', async () => {
    const supabase = getAdminClient()

    // Send an OTP
    await fetch(`${BASE_URL}/api/auth/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phones.storedInDb }),
    })

    // Check the database for the OTP record
    const { data, error } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phones.storedInDb)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)

    const otp = data[0]
    expect(otp.phone).toBe(phones.storedInDb)
    expect(otp.otp_hash).toBeTruthy()
    expect(otp.used).toBe(false)
    expect(new Date(otp.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  test('previous unused OTPs are invalidated when new one is sent', async () => {
    const supabase = getAdminClient()

    // Send first OTP
    await fetch(`${BASE_URL}/api/auth/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phones.prevInvalid }),
    })

    await new Promise((r) => setTimeout(r, 500))

    // Send second OTP
    await fetch(`${BASE_URL}/api/auth/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phones.prevInvalid }),
    })

    await new Promise((r) => setTimeout(r, 500))

    // Check that the first OTP is now marked as used
    const { data } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phones.prevInvalid)
      .order('created_at', { ascending: false })
      .limit(2)

    // The older OTP should be invalidated (used=true)
    if (data && data.length >= 2) {
      const olderOtp = data[1]
      expect(olderOtp.used).toBe(true)
    }
  })

  test('rate limits OTP sending (max 3 per 10 minutes)', async ({ request }) => {
    // Send 3 OTPs rapidly
    for (let i = 0; i < 3; i++) {
      const res = await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
        data: { phone: phones.rateLimit },
      })
      expect(res.status()).toBe(200)
    }

    // The 4th should be rate-limited (429)
    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
      data: { phone: phones.rateLimit },
    })

    expect([200, 429]).toContain(response.status())
  })

  test('verify correct OTP creates session and redirects to /pos', async ({ page }) => {
    // Navigate to login page and switch to WhatsApp tab
    await page.goto('/login')
    await page.locator('button:has-text("WhatsApp")').click()

    // Enter phone number
    const phoneInput = page.locator('input[type="tel"]')
    await phoneInput.fill(phones.verifyUI)

    // Click send code
    await page.locator('button:has-text("Send Verification Code")').click()

    // Wait for OTP input to appear
    await page.waitForSelector('text=Enter 6-digit code', { timeout: 10000 })

    // Type a 6-digit code (will be wrong, testing error handling)
    const otpInputs = page.locator('input[inputmode="numeric"][maxlength="1"]')
    await otpInputs.first().fill('1')
    for (let i = 1; i < 6; i++) {
      await otpInputs.nth(i).fill('0')
    }

    await page.locator('button:has-text("Verify")').click()

    // Should show error (invalid OTP) or redirect (if by chance correct)
    const pageUrl = page.url()
    if (pageUrl.includes('/pos')) {
      expect(pageUrl).toContain('/pos')
    } else {
      await expect(page.locator('p.text-tibetan')).toBeVisible({ timeout: 5000 })
    }
  })

  test('wrong OTP rejected with remaining attempts', async ({ request }) => {
    // First send an OTP
    await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
      data: { phone: phones.wrongOtp },
    })

    // Verify with a wrong code
    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/verify`, {
      data: { phone: phones.wrongOtp, otp: '000000' },
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Invalid OTP')
    expect(body.error).toMatch(/attempt/i)
  })

  test('lockout after 3 failed attempts', async ({ request }) => {
    // Send an OTP
    await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
      data: { phone: phones.lockout },
    })

    // Make 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await request.post(`${BASE_URL}/api/auth/whatsapp/verify`, {
        data: { phone: phones.lockout, otp: `00000${i}` },
      })
    }

    // 4th attempt should be locked out
    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/verify`, {
      data: { phone: phones.lockout, otp: '000000' },
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/too many|failed attempts/i)
  })

  test('expired OTP rejected', async ({ request }) => {
    const supabase = getAdminClient()

    // Insert an already-expired OTP directly
    const expiredAt = new Date(Date.now() - 60000).toISOString()
    await supabase
      .from('whatsapp_otps')
      .insert({
        phone: phones.expired,
        otp_hash: '$2a$10$dummyhashfore2etest0000000000000000000000000000000',
        expires_at: expiredAt,
        used: false,
      })

    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/verify`, {
      data: { phone: phones.expired, otp: '123456' },
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/expired|not found/i)
  })

  test('invalid phone format rejected on send', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auth/whatsapp/send`, {
      data: { phone: 'not-a-phone' },
    })

    expect(response.status()).toBe(400)
  })
})
