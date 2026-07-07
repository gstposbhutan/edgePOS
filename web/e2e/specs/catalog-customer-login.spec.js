const { test, expect } = require('@playwright/test')

// Customer sign-up: email OTP verifies the address, and the customer sets a strong password + phone.
// Sign-in afterwards is email + password. MOCK_WHATSAPP=true makes the code deterministic.
test.describe('Customer email sign-up', () => {
  test('create account: email → code + password + phone → shop', async ({ page }) => {
    await page.goto('/login?redirect=/shop')

    // Customer tab is default; switch to Create account.
    await page.getByRole('button', { name: /Create an account/i }).click()
    await page.getByPlaceholder('you@example.com').fill(`e2e_${Date.now()}@gmail.com`)
    await page.getByRole('button', { name: /Email me a code/i }).click()

    // Mock: code returned + auto-filled.
    await expect(page.getByText(/Demo code/i)).toBeVisible({ timeout: 15000 })
    await page.getByPlaceholder(/Min 8 chars/i).fill('Passw0rd123')
    await page.locator('input[type="tel"]').fill('+97517112233')
    await page.getByRole('button', { name: /Create account/i }).click()

    await page.waitForURL(/\/shop/, { timeout: 15000 })
    console.log('CUSTOMER_SIGNUP_OK')
  })
})
