/**
 * V1 — Auth E2E Specification
 *
 * Covers email/password login, sign-out, session persistence,
 * route protection, tab switching, and WhatsApp OTP flow.
 *
 * This spec is matched by the "unauthenticated" Playwright project
 * (no saved storageState) so every test starts logged out.
 */
const { test, expect } = require('@playwright/test')
const { LoginPage } = require('../page-objects/login-page')
const { TEST_USERS } = require('../fixtures/test-data')

// Convenience aliases for test users
const CASHIER = TEST_USERS[0]  // cashier@teststore.bt
const MANAGER = TEST_USERS[1]  // manager@teststore.bt
const OWNER   = TEST_USERS[2]  // owner@teststore.bt

// ─────────────────────────────────────────────────────────────────────
// Email / Password Login
// ─────────────────────────────────────────────────────────────────────
test.describe('Email/Password Login', () => {
  let loginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
  })

  test('signs in with valid credentials and redirects to /pos', async ({ page }) => {
    await loginPage.loginWithEmail(CASHIER.email, CASHIER.password)

    await expect(page).toHaveURL(/\/pos/)
  })

  test('shows error for wrong password', async ({ page }) => {
    await loginPage.emailInput.fill(CASHIER.email)
    await loginPage.passwordInput.fill('WrongPassword!999')
    await loginPage.signInButton.click()
    // Wait for error to appear (no redirect on failure)
    await page.waitForTimeout(2000)

    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('shows error for non-existent email', async ({ page }) => {
    await loginPage.emailInput.fill('nobody@nowhere.bt')
    await loginPage.passwordInput.fill('DoesNotMatter!1')
    await loginPage.signInButton.click()
    await page.waitForTimeout(2000)

    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('password visibility toggle switches field type', async () => {
    // Initially password is hidden
    expect(await loginPage.isPasswordVisible()).toBe(false)

    await loginPage.togglePasswordVisibility()
    expect(await loginPage.isPasswordVisible()).toBe(true)

    await loginPage.togglePasswordVisibility()
    expect(await loginPage.isPasswordVisible()).toBe(false)
  })

  test('redirects to ?redirect path after login', async ({ page }) => {
    // Navigate directly with a redirect query param
    await page.goto('/login?redirect=/pos/settings')

    await loginPage.emailInput.fill(CASHIER.email)
    await loginPage.passwordInput.fill(CASHIER.password)
    await loginPage.signInButton.click()

    await expect(page).toHaveURL(/\/pos\/settings/, { timeout: 30000 })
  })
})

// ─────────────────────────────────────────────────────────────────────
// Sign Out
// ─────────────────────────────────────────────────────────────────────
test.describe('Sign Out', () => {
  test('signs out and redirects to /login', async ({ page }) => {
    // Sign in first
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.loginWithEmail(CASHIER.email, CASHIER.password)
    await expect(page).toHaveURL(/\/pos/, { timeout: 30000 })

    // Wait for POS to finish loading (spinner disappears), then click sign out
    await expect(page.getByText('Loading POS...')).not.toBeVisible({ timeout: 30000 })
    const signOutButton = page.locator('button[title="Sign out"]')
    await signOutButton.waitFor({ state: 'visible', timeout: 15000 })
    await signOutButton.click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})

// ─────────────────────────────────────────────────────────────────────
// Session Persistence
// ─────────────────────────────────────────────────────────────────────
test.describe('Session Persistence', () => {
  test('remains signed in after page refresh', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.loginWithEmail(MANAGER.email, MANAGER.password)
    await expect(page).toHaveURL(/\/pos/, { timeout: 30000 })

    // Refresh the page
    await page.reload()

    // Should still be on /pos (not redirected to /login)
    await expect(page).toHaveURL(/\/pos/, { timeout: 10000 })
  })
})

// ─────────────────────────────────────────────────────────────────────
// Route Protection
// ─────────────────────────────────────────────────────────────────────
test.describe('Route Protection', () => {
  test('redirects unauthenticated user from /pos to /login', async ({ page }) => {
    await page.goto('/pos')

    // Should end up on /login (possibly with ?redirect=/pos)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('preserves intended destination in redirect param', async ({ page }) => {
    await page.goto('/pos/settings')

    await expect(page).toHaveURL(/\/login.*redirect=/, { timeout: 10000 })
  })
})

// ─────────────────────────────────────────────────────────────────────
// Tab Switching
// ─────────────────────────────────────────────────────────────────────
test.describe('Tab Switching', () => {
  let loginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
  })

  test('Email tab is active by default', async () => {
    await expect(loginPage.emailInput).toBeVisible()
  })

  test('switching to WhatsApp tab shows phone input', async () => {
    await loginPage.switchToWhatsAppTab()

    await expect(loginPage.phoneInput).toBeVisible()
  })

  test('switching back to Email tab shows email form', async ({ page }) => {
    await loginPage.switchToWhatsAppTab()
    await expect(loginPage.phoneInput).toBeVisible()

    await loginPage.switchToEmailTab()
    await expect(loginPage.emailInput).toBeVisible()
  })

  test('clears error when switching tabs', async ({ page }) => {
    // Trigger an error on the email form by submitting with invalid creds
    await loginPage.emailInput.fill('bad@user.bt')
    await loginPage.passwordInput.fill('wrong')
    await loginPage.signInButton.click()
    // Wait briefly for error to appear
    await page.waitForTimeout(2000)
    const errorBefore = await loginPage.getErrorText()
    expect(errorBefore).not.toBeNull()

    // Switch tabs — error should clear
    await loginPage.switchToWhatsAppTab()
    const errorAfter = await loginPage.getErrorText()
    expect(errorAfter).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// WhatsApp OTP
// ─────────────────────────────────────────────────────────────────────
test.describe('WhatsApp OTP', () => {
  let loginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.switchToWhatsAppTab()
  })

  test('shows validation error for invalid phone number', async () => {
    await loginPage.phoneInput.fill('123')
    await loginPage.clickSendOtp()

    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('sends OTP and shows verification form', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100050')
    await loginPage.clickSendOtp()

    // Should transition to OTP verification form
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })
    await expect(loginPage.verifyOtpButton).toBeVisible()
  })

  test('wrong OTP is rejected', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100051')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    // Fill a wrong 6-digit code
    await loginPage.fillOtp('000000')
    await loginPage.clickVerifyOtp()

    // Wait for error response from server
    await page.waitForTimeout(3000)
    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('Change number button returns to phone entry', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100052')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    await loginPage.clickChangeNumber()

    // Should be back on phone entry form
    await expect(loginPage.phoneInput).toBeVisible()
    await expect(loginPage.sendOtpButton).toBeVisible()
  })

  test('Resend code button is disabled during cooldown', async ({ page }) => {
    // Use a unique phone to avoid rate limit from earlier tests
    await loginPage.phoneInput.fill('+97517100099')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    // Resend should show countdown text — check for any "Resend in" text
    await expect(page.getByText(/resend in/i)).toBeVisible({ timeout: 5000 })
  })
})
