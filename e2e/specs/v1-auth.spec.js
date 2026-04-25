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

  test('shows error for wrong password', async () => {
    await loginPage.loginWithEmail(CASHIER.email, 'WrongPassword!999')

    // Should stay on login page with an error
    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('shows error for non-existent email', async () => {
    await loginPage.loginWithEmail('nobody@nowhere.bt', 'DoesNotMatter!1')

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

    // Find and click sign-out button/menu — common patterns:
    // sidebar footer, avatar dropdown, or header button.
    const signOutButton = page.getByRole('button', { name: /sign out|log out/i })
    const signOutLink = page.getByRole('link', { name: /sign out|log out/i })
    const signOutMenuTrigger = page.locator('[data-testid="user-menu"], [aria-label="User menu"]')

    if (await signOutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signOutButton.click()
    } else if (await signOutLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signOutLink.click()
    } else if (await signOutMenuTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signOutMenuTrigger.click()
      // Then look for sign-out option in the dropdown
      await page.getByRole('menuitem', { name: /sign out|log out/i }).click()
    }

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

  test('clears error when switching tabs', async () => {
    // Trigger an error on the email form
    await loginPage.loginWithEmail('bad@user.bt', 'wrong')
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
    // Use the test phone from fixtures
    await loginPage.phoneInput.fill('+97517100001')
    await loginPage.clickSendOtp()

    // Should transition to OTP verification form
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })
    await expect(loginPage.verifyOtpButton).toBeVisible()
  })

  test('wrong OTP is rejected', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100001')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    // Fill a wrong 6-digit code
    await loginPage.fillOtp('000000')
    await loginPage.clickVerifyOtp()

    const errorText = await loginPage.getErrorText()
    expect(errorText).not.toBeNull()
  })

  test('Change number button returns to phone entry', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100001')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    await loginPage.clickChangeNumber()

    // Should be back on phone entry form
    await expect(loginPage.phoneInput).toBeVisible()
    await expect(loginPage.sendOtpButton).toBeVisible()
  })

  test('Resend code button is disabled during cooldown', async ({ page }) => {
    await loginPage.phoneInput.fill('+97517100001')
    await loginPage.clickSendOtp()
    await expect(loginPage.otpLabel).toBeVisible({ timeout: 10000 })

    // Resend should show countdown text immediately after send
    const resendButton = page.getByText(/resend in \d+s/i)
    await expect(resendButton).toBeVisible({ timeout: 5000 })
  })
})
