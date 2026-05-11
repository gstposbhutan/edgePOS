/**
 * BasePage — shared helpers for every page object.
 *
 * All page objects extend this class so common navigation,
 * waiting, and toast-dismissal logic lives in one place.
 */
class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  // ── Navigation ─────────────────────────────────────────────────────

  /**
   * Navigate to a path relative to the Playwright baseURL.
   * @param {string} path — e.g. '/login', '/pos'
   */
  async navigate(path) {
    await this.page.goto(path)
  }

  /**
   * Wait until the page reaches a settled state — network idle
   * and any visible loading spinner gone.
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle')
    // Dismiss loading spinners if present
    const spinner = this.page.locator('[data-loading="true"], .animate-spin').first()
    if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spinner.waitFor({ state: 'hidden', timeout: 15000 })
    }
  }

  /**
   * Wait for the URL to match a pattern.
   * @param {string|RegExp} pattern
   * @param {object} [options]
   */
  async waitForUrl(pattern, options) {
    await this.page.waitForURL(pattern, options)
  }

  // ── Queries ────────────────────────────────────────────────────────

  /**
   * Get a locator by exact visible text.
   * @param {string} text
   */
  getByText(text) {
    return this.page.getByText(text)
  }

  // ── Toast dismissal ────────────────────────────────────────────────

  /**
   * Dismiss sonner toast notifications if any are present.
   * Sonner renders toasts inside `[data-sonner-toaster]` and each
   * toast has a close button or can be dismissed by clicking.
   */
  async dismissToasts() {
    const toasts = this.page.locator('[data-sonner-toaster] [data-sonner-toast]')
    const count = await toasts.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      const closeBtn = toasts.nth(i).locator('button[aria-label="Close"]')
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click()
      }
    }
  }

  // ── Navigation helpers ─────────────────────────────────────────────

  /**
   * Click the back / navigation button. Tries common patterns:
   * a button with an arrow-left icon, a '[data-testid="back"]'
   * element, or browser back as a last resort.
   */
  async clickBack() {
    const explicit = this.page.locator('[data-testid="back"], [data-testid="go-back"]')
    if (await explicit.isVisible({ timeout: 1000 }).catch(() => false)) {
      await explicit.click()
      return
    }

    // Lucide ArrowLeft is a common back icon
    const iconBack = this.page.locator('button:has(svg.lucide-arrow-left), a:has(svg.lucide-arrow-left)').first()
    if (await iconBack.isVisible({ timeout: 1000 }).catch(() => false)) {
      await iconBack.click()
      return
    }

    await this.page.goBack()
  }
}

module.exports = { BasePage }
