const { test, expect } = require('@playwright/test')

// Customer email-OTP login/signup + mandatory phone step (WhatsApp auth replaced). MOCK_WHATSAPP=true
// makes the code deterministic (auto-filled + shown as "Demo code").
test.describe('Customer email-OTP login', () => {
  test('email → code → phone → shop', async ({ page }) => {
    await page.goto('/login?redirect=/shop')

    // Customer tab is default for a /shop redirect.
    await page.getByPlaceholder('you@example.com').fill(`e2e_${Date.now()}@gmail.com`)
    await page.getByRole('button', { name: /Email me a code/i }).click()

    // Mock: code is returned + auto-filled.
    await expect(page.getByText(/Demo code/i)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /Verify & Continue/i }).click()

    // New customer → mandatory phone step.
    await expect(page.getByText(/One more step/i)).toBeVisible({ timeout: 15000 })
    await page.locator('input[type="tel"]').fill('+97517112233')
    await page.getByRole('button', { name: /^Continue$/ }).click()

    await page.waitForURL(/\/shop/, { timeout: 15000 })
    console.log('CUSTOMER_OTP_OK')
  })
})
